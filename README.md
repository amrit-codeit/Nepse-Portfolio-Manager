# Nepal Portfolio Manager (Premium Edition)

A professional-grade personal portfolio management system designed specifically for the Nepali stock market (NEPSE). Track investments with precision using dual-WACC logic, automated MeroShare synchronization, and DP statement reconciliation for mutual funds.

## 🚀 One-Click Setup (Windows)

The project includes automated scripts for a frictionless start.

1. **Prerequisites**:
   - [Python 3.10+](https://www.python.org/downloads/)
   - [Node.js](https://nodejs.org/)

2. **Installation**:
   - Double-click **`setup.bat`** in the root folder.
   - This creates a virtual environment, installs dependencies (FastAPI & React), and generates your local encryption keys.

3. **Running the App**:
   - Double-click **`run.bat`**.
   - Accessible at: `http://localhost:5173`

## ✨ Advanced Features

- **📊 Advanced Transaction Management**:
  - **Equity vs SIP Separation**: Dedicated tabs for managing secondary market shares and open-ended mutual funds.
  - **DP Statement Import**: Pure data import for SIPs (NI31, NIBLSF, NMBSBFE, etc.) directly from official PDF/CSV statements.
  - **Smart Classification**: Strict priority-based tagging (IPO, FPO, Bonus, Right, Merge, Buy, Sell) using advanced regex and quantity validation.

- **📈 Dual WACC Engine**:
  - **True WACC**: Bonus/Right shares at actual cost (Rs. 0 for bonus). Reflects your true financial ROI.
  - **Tax WACC**: Matches MeroShare/CDSC rules (Rs. 100 for bonus). Critical for Capital Gains Tax (CGT) accuracy.

- **📉 Analysis Tools**:
  - **Order Simulator**: Real-time Buy/Sell calculator with SEBON fees and FIFO CGT estimation.
  - **Scrip Intelligence**: Detailed dashboards for every stock with historical charts and transaction dots.
  - **Advanced Metrics**: Herfindahl-Hirschman Index (HHI), Portfolio XIRR, and Yield on Cost tracking.

- **🛡️ Secure & Private**:
  - **Local-First**: All data is stored in a local SQLite database (`portfolio.db`).
  - **Encrypted**: Your MeroShare credentials are encrypted locally on your machine.

## ⚖️ License & Intellectual Property

This software is provided for personal, non-commercial use. 

### Recommended License: MIT License
If you plan to share this on GitHub, the **MIT License** is the industry standard for lightweight, open-source projects. 
- **Permission**: Commercial use, modification, distribution, and private use.
- **Condition**: The above copyright notice and this permission notice shall be included in all copies.
- **Limitation**: No Liability; No Warranty.

---
*Created with ❤️ for Nepali Investors.*
