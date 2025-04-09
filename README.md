
# Beerio: The Beer Bang-for-Buck Finder

**Beerio** is a community-powered app that helps beer enthusiasts find the best-value beers at bars and pubs near them. By crowdsourcing beer prices, sizes, and alcohol content, Beerio ensures that you can make the most cost-effective decision for your next night out. Whether you're a frugal beer lover or an optimization geek, Beerio has your back! Built with **Expo React** and **SupaBase**, the app combines sleek user interfaces with real-time data storage.

---

## Features

- **Crowdsourced Data**: Users can report beer prices, sizes, and ABV from their favorite bars and establishments.
- **Real-Time Updates**: Automatically sync and display the latest beer data using SupaBase's real-time database.
- **Value Calculation**: Computes a "value score" (price-to-ABV ratio) to showcase the best bang-for-your-buck beers.
- **Location-Based Search**: Filter results based on your current location or search a specific area.
- **User-Friendly Interface**: Built with Expo React for a clean and responsive design.

---

## Tech Stack

- **Frontend**: [Expo React](https://expo.dev/) - For building the app's user interface.
- **Backend**: [SupaBase](https://supabase.io/) - Handles the database, authentication, and real-time data updates.
- **Other Tools**: JavaScript/TypeScript for development, Expo CLI for building and deploying the app.

---

## Installation

### Prerequisites

1. Install [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/).
2. Install [Expo CLI](https://expo.dev/).

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/sjpmax/beerio.git
   cd beerio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your SupaBase project:
   - Create a new project at [SupaBase](https://supabase.io/).
   - Set up a database table for beer data (e.g., name, price, size, ABV, etc.).
   - Obtain your SupaBase API keys and URL.

4. Add your environment variables:
   - Create a `.env` file in the root directory and add:
     ```
     SUPABASE_URL=your-supabase-url
     SUPABASE_KEY=your-supabase-key
     ```

5. Run the development server:
   ```bash
   npm start
   ```

6. Open the app in your device or emulator via Expo Go.

---

## Usage

1. Open Beerio and log in or sign up.
2. Add beer data by entering:
   - Name
   - Price
   - Size (oz/ml)
   - ABV (%)
3. Browse local beer listings, sorted by "value score," ABV, or price.
4. Search for beers by location to find the best deals wherever you are.
5. Let Beerio guide you to optimal beer bliss!

---

## Contributing

Want to improve Beerio? Contributions are welcome! Feel free to:
- Report issues or suggest features.
- Fork the repository and submit a pull request.

---

## License

This project is licensed under the MIT License.

