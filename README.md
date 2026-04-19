# Nepal Portfolio Manager (Premium Edition)

A professional-grade personal portfolio management and AI analysis system designed specifically for the Nepali stock market (NEPSE). Track investments with precision using dual-WACC logic, automated MeroShare synchronization, and advanced AI-driven stock insights.

## 🚀 One-Click Setup (Windows)

We've designed the installation to be completely zero-friction. You literally just click a file and wait.

### Installation
1. Download or clone this repository to your PC.
2. Double-click the **`setup.bat`** file in the main folder.
3. **Grab a coffee!** The script is fully automated. It will:
   - Check if your PC has Python and Node.js.
   - **Automatically download and install Python and Node.js** (via Windows `winget`) if you don't have them!
   - Create a securely isolated virtual environment.
   - Install all backend dependencies (FastAPI, Pandas, etc.).
   - Create secure `.env` files with a fresh, locally-generated encryption key.
   - Install all frontend dependencies (React, Vite, Tailwind).

*(Note: If `setup.bat` installs Python or Node for you, it may notify you to close the black terminal window and double-click `setup.bat` one more time so your PC recognizes the new software).*

### 🏃 Running the Application
Once the setup is complete, starting the app is just as easy:
1. Double-click the **`run.bat`** file.
2. Your system will launch both the backend server and frontend interface.
3. Your web browser will automatically open to `http://localhost:5173`. 

---

## 💡 How to Use the Project

### 1. Connecting MeroShare
- Upon launch, navigate to the **Settings** or Profile tab.
- Enter your MeroShare details securely. Your credentials are encrypted locally on your hard drive (they are never sent to the internet).
- Return to your Dashboard and click "Sync MeroShare" to pull your live secondary market transactions automatically.

### 2. Managing Your Portfolio 
- **Equities vs SIPs**: Manage your standard share holdings on the Equity page and mutual funds (like NI31 or NIBLSF) in the SIP dashboard.
- **DP Statements**: Manually upload your DP statements directly via PDF/CSV for precise transaction tracking (bonuses, right shares, FPO, etc.).

### 3. Exploring NEPSE Insights (AI Analysis)
- Navigate to the **Insights** tab to get a professional 360-degree view of your stocks.
- **Fundamental & Technical Data**: The system automatically pulls live market data, P/E, EPS, dividend history, and technical indicators (RSI, MACD, Bollinger Bands).
- The built-in **Local AI Assistant** analyzes these metrics using strictly formatted Value Investing or Trading frameworks, providing actionable verdicts just like a professional portfolio manager.

---

## ✨ Key Features
- **Dual WACC Engine**: Tracks both True-cost WACC (Bonus shares at Rs. 0 for real ROI) and Tax-cost WACC (Bonus shares at Rs. 100 for CDSC Capital Gains Tax accuracy).
- **Data Privacy**: Local-First Architecture utilizing SQLite (`portfolio.db`). Your data never leaves your computer.
- **Dividend Tax Logic**: Automatically deducts 5% TDS for both cash and bonus dividends precisely.
- **Performance Simulators**: Real-time Buy/Sell calculators with built-in SEBON fee schedules.

## ⚖️ License
This software is provided for personal, non-commercial use under the **MIT License**.

## ⚖️ Legal Disclaimer

This application is provided strictly for educational and personal research purposes. 

* **No Financial Advice:** The analytics, AI-generated insights, and financial metrics presented here are for informational use only and do not constitute professional investment, financial, or legal advice.
* **Accuracy of Data:** While this system uses advanced scraping and modeling, stock market data is volatile. All calculations, including WACC and tax liabilities, should be manually cross-verified.
* **Personal Passion Project:** This is a "vibe-coded" application intended to demonstrate modern software engineering patterns in the context of the Nepali Stock Market. 

*Created with ❤️ for Nepali Investors.*
