# Nepal Portfolio Manager

A powerful, personal portfolio management system designed specifically for the Nepali stock market (NEPSE). Track your investments with dual-WACC logic, separating real cash flow from tax reporting.

## 🚀 One-Click Setup (Windows)

The project includes an automated setup script for easy installation.

1. **Prerequisites**:
   - Install [Python 3.10+](https://www.python.org/downloads/)
   - Install [Node.js](https://nodejs.org/)

2. **Installation**:
   - Double-click **`setup.bat`** in the root folder.
   - This script will automatically create a virtual environment, install all dependencies (backend & frontend), and generate a secure encryption key for your credentials.

3. **Running the App**:
   - Simply double-click **`run.bat`** in the root folder.
   - This will launch both the Backend (FastAPI) and Frontend (React) in separate windows.

## ✨ Key Features

- **Dual WACC Tracking**:
  - **True WACC**: Bonus/Right shares at actual cost (Rs. 0 for bonus). Shows real ROI.
  - **Tax WACC**: Matches MeroShare/CDSC rules (Rs. 100 for bonus). Essential for CGT calculation.
- **Automated Sync**: Scrapes transaction history directly from MeroShare.
- **Live Prices**: Real-time LTP updates from ShareSansar/NEPSE.
- **Security**: Credentials are encrypted locally on your machine.
- **Multi-Member**: Track portfolios for multiple family members in one place.

## 🛡️ Privacy & Security

- All data stays on **your local machine** in a SQLite database (`portfolio.db`).
- The `.env` file contains your private encryption key. **Never share this file or commit it to Git.**
- The repository is pre-configured with a `.gitignore` to keep your personal data safe.

---
*Created with ❤️ for Nepali Investors.*
