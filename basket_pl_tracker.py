import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import yfinance as yf
import time
from datetime import datetime, timedelta
import os

# Scopes for Google Sheets and Drive
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

class BasketPLTracker:
    def __init__(self, service_account_file='service_account.json', spreadsheet_name='Basket P&L Check in Chart'):
        self.service_account_file = service_account_file
        self.spreadsheet_name = spreadsheet_name
        self.gc = None
        self.sh = None

    def authenticate(self):
        """Authenticates with Google Sheets using a service account."""
        if not os.path.exists(self.service_account_file):
            print(f"Error: {self.service_account_file} not found.")
            return False

        credentials = Credentials.from_service_account_file(self.service_account_file, scopes=SCOPES)
        self.gc = gspread.authorize(credentials)
        return True

    def initialize_spreadsheet(self):
        """Creates or opens the spreadsheet and initializes sheets."""
        try:
            self.sh = self.gc.open(self.spreadsheet_name)
            print(f"Opened existing spreadsheet: {self.spreadsheet_name}")
        except gspread.exceptions.SpreadsheetNotFound:
            self.sh = self.gc.create(self.spreadsheet_name)
            print(f"Created new spreadsheet: {self.spreadsheet_name}")

        # Initialize Sheet1
        try:
            sheet1 = self.sh.worksheet('Sheet1')
        except gspread.exceptions.WorksheetNotFound:
            sheet1 = self.sh.add_worksheet(title='Sheet1', rows=100, cols=10)

        headers1 = ['Entry Date', 'Symbol', 'Action', 'Quantity', 'Entry Price', 'LTP', 'P&L']
        sheet1.update('A1:G1', [headers1])

        # Initialize Sheet2
        try:
            sheet2 = self.sh.worksheet('Sheet2')
        except gspread.exceptions.WorksheetNotFound:
            sheet2 = self.sh.add_worksheet(title='Sheet2', rows=1000, cols=5)

        headers2 = ['X Date & Time', 'P&L History']
        sheet2.update('A1:B1', [headers2])

        return True

    def fetch_market_data(self, symbol, target_datetime=None):
        """
        Fetches 30-min close data for a symbol.
        If target_datetime is provided, it returns the closest 30-min close price.
        Otherwise, it returns the current LTP and the historical data.
        """
        try:
            ticker = yf.Ticker(symbol)

            if target_datetime:
                # Ensure target_datetime is a datetime object
                if isinstance(target_datetime, str):
                    try:
                        target_dt = datetime.strptime(target_datetime, '%Y-%m-%d %H:%M')
                    except ValueError:
                        target_dt = datetime.strptime(target_datetime, '%Y-%m-%d %H:%M:%S')
                else:
                    target_dt = target_datetime

                # Fetch data around the target date
                start_date = (target_dt - timedelta(days=2)).strftime('%Y-%m-%d')
                end_date = (target_dt + timedelta(days=2)).strftime('%Y-%m-%d')

                hist = ticker.history(start=start_date, end=end_date, interval='30m')
                if hist.empty:
                    return None, None

                # Find the closest timestamp in the index
                # yfinance index is timezone-aware usually, so we might need to handle that
                if hist.index.tz is not None:
                    target_dt = target_dt.replace(tzinfo=hist.index.tz)

                # Get the row closest to target_dt
                # We look for the candle that contains this timestamp or is just after
                idx = hist.index.get_indexer([target_dt], method='nearest')[0]
                price = hist['Close'].iloc[idx]
                return price, hist
            else:
                # Standard LTP fetch
                hist = ticker.history(period='1d', interval='30m')
                if hist.empty:
                    hist = ticker.history(period='5d', interval='30m')

                if hist.empty:
                    return None, None

                ltp = hist['Close'].iloc[-1]
                return ltp, hist
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None, None

    def calculate_pl(self):
        """Calculates P&L and updates sheets."""
        try:
            sheet1 = self.sh.worksheet('Sheet1')
            # Using get_all_values to have more control over row indices
            rows = sheet1.get_all_values()
            if len(rows) <= 1:
                print("No trade data found in Sheet1.")
                return

            headers = rows[0]
            data_rows = rows[1:]

            total_pl = 0
            sheet1_updates = []

            # Find column indices
            col_map = {h: i for i, h in enumerate(headers)}

            for i, row in enumerate(data_rows):
                symbol = row[col_map['Symbol']]
                action = str(row[col_map['Action']]).upper()
                quantity = row[col_map['Quantity']]
                entry_price = row[col_map['Entry Price']]
                entry_date = row[col_map['Entry Date']]

                if not symbol or not quantity:
                    continue

                ltp, _ = self.fetch_market_data(symbol)
                if ltp is None:
                    continue

                # Calculate or fetch Entry Price if missing
                if not entry_price or entry_price == "":
                    if entry_date:
                        print(f"Fetching historical entry price for {symbol} on {entry_date}")
                        entry_price, _ = self.fetch_market_data(symbol, target_datetime=entry_date)

                    if entry_price is None:
                        entry_price = ltp

                    # Batch update for Entry Price (Column E is index 4)
                    sheet1_updates.append({
                        'range': f'E{i+2}',
                        'values': [[entry_price]]
                    })

                try:
                    qty = float(quantity)
                    ep = float(entry_price)
                except ValueError:
                    continue

                if 'BUY' in action:
                    pl = (ltp - ep) * qty
                elif 'SELL' in action:
                    pl = (ep - ltp) * qty
                else:
                    pl = 0

                total_pl += pl

                # Prepare updates for LTP and P&L columns (F and G)
                sheet1_updates.append({
                    'range': f'F{i+2}:G{i+2}',
                    'values': [[ltp, pl]]
                })

            if sheet1_updates:
                sheet1.batch_update(sheet1_updates)

            # Update Sheet2 (History)
            sheet2 = self.sh.worksheet('Sheet2')
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            sheet2.append_row([now, total_pl])

            print(f"Updated P&L at {now}. Total P&L: {total_pl}")

        except Exception as e:
            print(f"Error calculating P&L: {e}")

    def create_chart(self):
        """Creates or updates a comparison chart in Sheet2."""
        try:
            sheet2 = self.sh.worksheet('Sheet2')

            # We want to create a line chart of P&L history over time
            # Source data is in Sheet2 Column A (Date/Time) and B (P&L)

            # Check if chart already exists (gspread doesn't easily list charts,
            # so we'll use the spreadsheet update to add/refresh)
            # For simplicity, we'll use a batch update to add the chart.
            # If it already exists, it might create a duplicate in some versions,
            # but standard practice is often to manage it via the API directly.

            # Get sheet ID for Sheet2
            sheet_id = sheet2._properties['sheetId']

            body = {
                "requests": [
                    {
                        "addChart": {
                            "chart": {
                                "spec": {
                                    "title": "Basket P&L History",
                                    "basicChart": {
                                        "chartType": "LINE",
                                        "legendPosition": "BOTTOM_LEGEND",
                                        "axis": [
                                            {"position": "BOTTOM_AXIS", "title": "Date & Time"},
                                            {"position": "LEFT_AXIS", "title": "P&L"}
                                        ],
                                        "domains": [
                                            {
                                                "domain": {
                                                    "sourceRange": {
                                                        "sources": [
                                                            {
                                                                "sheetId": sheet_id,
                                                                "startRowIndex": 0,
                                                                "endRowIndex": 1000,
                                                                "startColumnIndex": 0,
                                                                "endColumnIndex": 1
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ],
                                        "series": [
                                            {
                                                "series": {
                                                    "sourceRange": {
                                                        "sources": [
                                                            {
                                                                "sheetId": sheet_id,
                                                                "startRowIndex": 0,
                                                                "endRowIndex": 1000,
                                                                "startColumnIndex": 1,
                                                                "endColumnIndex": 2
                                                            }
                                                        ]
                                                    }
                                                },
                                                "targetAxis": "LEFT_AXIS"
                                            }
                                        ],
                                        "headerCount": 1
                                    }
                                },
                                "position": {
                                    "overlayPosition": {
                                        "anchorCell": {"sheetId": sheet_id, "rowIndex": 1, "columnIndex": 3},
                                        "offsetXPixels": 0,
                                        "offsetYPixels": 0
                                    }
                                }
                            }
                        }
                    }
                ]
            }

            # To avoid duplicate charts on every 30-min run, we'll check if a chart exists.
            # While gspread doesn't easily list charts, we can use a flag in the sheet
            # or simply only create it if we have at least 2 data points (enough for a line)
            # and we haven't created it yet in this session.

            if not hasattr(self, '_chart_created'):
                rows = sheet2.get_all_values()
                if len(rows) >= 3: # Header + at least 2 data points
                    self.sh.batch_update(body)
                    self._chart_created = True
                    print("Created P&L History Chart in Sheet2.")

        except Exception as e:
            print(f"Error creating chart: {e}")

    def run(self, iterations=None):
        """Main loop to update every 30 minutes."""
        if not self.authenticate():
            return

        self.initialize_spreadsheet()

        count = 0
        while True:
            self.calculate_pl()
            self.create_chart()

            count += 1
            if iterations and count >= iterations:
                break

            print("Sleeping for 30 minutes...")
            time.sleep(1800) # 30 minutes

if __name__ == "__main__":
    # To use this script:
    # 1. Place your 'service_account.json' in the same directory.
    # 2. Add your trades to 'Sheet1' of the 'Basket P&L Check in Chart' Google Sheet.
    # 3. Columns for Sheet1: Entry Date, Symbol, Action, Quantity, Entry Price, LTP, P&L.

    tracker = BasketPLTracker()
    tracker.run()
