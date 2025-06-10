# OpenFrontIO

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="resources/images/OpenFrontLogoDark.svg">
    <source media="(prefers-color-scheme: light)" srcset="resources/images/OpenFrontLogo.svg">
    <img src="resources/images/OpenFrontLogo.svg" alt="OpenFrontIO Logo" width="300">
  </picture>
</p>

![Prettier Check](https://github.com/openfrontio/OpenFrontIO/actions/workflows/prettier.yml/badge.svg)
[![Crowdin](https://badges.crowdin.net/openfront-mls/localized.svg)](https://crowdin.com/project/openfront-mls)

Open Front mode which adds new buildings and war vehicles like airports, warplanes and more.

This is a fork/rewrite of WarFront.io. Credit to https://github.com/WarFrontIO.

# OpenFront - Licensing

This project uses a dual-licensing approach:

- Code in the `server/` and `core/` directory is licensed under MIT
- Client code (in the `client/` directory) is licensed under GPL v3

## 🌟 Features

- **Real-time Strategy Gameplay**: Expand your territory and engage in strategic battles
- **Alliance System**: Form alliances with other players for mutual defense
- **Multiple Maps**: Play across various geographical regions including Europe, Asia, Africa, and more
- **Resource Management**: Balance your expansion with defensive capabilities
- **Cross-platform**: Play in any modern web browser

## 📋 Prerequisites

- [npm](https://www.npmjs.com/) (v10.9.2 or higher)
- A modern web browser (Chrome, Firefox, Edge, etc.)

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/vidgame/OpenFrontIO.git
   cd OpenFrontIO
   ```

2. **Install dependencies**

   ```bash
   npm i
   ```

## 🎮 Running the Game

### Development Mode

Run both the client and server in development mode with live reloading:

```bash
npm run dev
```

This will:

- Start the webpack dev server for the client
- Launch the game server with development settings
- Open the game in your default browser

### Client Only

To run just the client with hot reloading:

```bash
npm run start:client
```

### Server Only

To run just the server with development settings:

```bash
npm run start:server-dev
```

## 🛠️ Development Tools

- **Format code**:

  ```bash
  npm run format
  ```

- **Lint code**:

  ```bash
  npm run lint
  ```

- **Lint and fix code**:
  ```bash
  npm run lint:fix
  ```

## 🏗️ Project Structure

- `/src/client` - Frontend game client
- `/src/core` - Shared game logic
- `/src/server` - Backend game server
- `/resources` - Static assets (images, maps, etc.)

## 📝 License

This project is licensed under the terms found in the [LICENSE](LICENSE) file.

## 👩‍💻 Dev 
This fork is from Vidgame3

