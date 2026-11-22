# Balloon Race

A 3D hot air balloon race for up to 8 players, played live online with a room code.

- Three flights per game: Candy Land, Floating Sky Islands, Volcano Island
- Arrow keys (or WASD, or the on-screen buttons on tablets) steer, climb and descend
- Each altitude has its own wind. The panel on the left shows which layers are fast, slow or a headwind
- Collect gems (10) and rings (50), and reach the finish line within 3 minutes or you score 0 for that flight
- Finish bonus by order: 300, 200, 150, 100, 75, 50, 25, 10
- Highest total after three flights wins

Built with [Babylon.js](https://www.babylonjs.com/) and [PeerJS](https://peerjs.com/).

## Run locally

    npm install
    npm run dev

## Deploy

Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`.
