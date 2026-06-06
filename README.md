## MapChats

I forked this project from: [Chatbot UI Lite](https://github.com/mckaywrigley/chatbot-ui-lite)

A specialized AI assistant for Kerala Real Estate, featuring interactive maps, project tracking, and a charismatic broker persona.

See a [demo](https://mapchats.com)

## Features

- **Project Database**: Automatically loads and parses real estate data from `project_list.csv`.
- **District Grouping**: Sidebar automatically categorizes projects by district with collapsible navigation.
- **Charismatic AI Broker**: The assistant adopts a "facts-and-figures" broker persona, sliding glossy brochures and quoting RERA details, unit counts, and completion dates.
- **Advanced Map Pane**:
    - **Smart Geocoding**: Optimized search using `Village + Taluk` for high hit rates in Kerala.
    - **Map Lock**: Toggle to prevent accidental panning/zooming.
    - **Drawing Mode**: Sketch directly on the map for site planning or annotation.
    - **Context Awareness**: The map automatically syncs with whichever project is selected in the sidebar.
- **Fixed Frame Layout**: Independent scrolling for the sidebar and chat keeps the map visible at all times.

## Technical Architecture (for Future Me)

- **Data Layer**: Parsing logic is in `pages/index.tsx`. It uses a regex-based CSV splitter to handle project names containing commas.
- **Persona Management**: The "Broker" prompt is injected during the CSV-to-Chat object conversion in the main `useEffect` of `Home`.
- **Map Component**: `components/MapPane.tsx` handles OpenStreetMap integration. It features a custom SVG overlay for the drawing mode and coordinate projection logic.
- **Layout**: Uses Tailwind's `h-[calc(100vh-64px)]` on the main wrapper to ensure the app fits the screen without page-level scrolling.

## Running Locally

**1. Clone Repo**

```bash
git clone https://github.com/sankar-nath/mapchats
```

**2. Install Dependencies**

```bash
npm i
```

**3. Provide OpenAI API Key**

Create a .env.local file in the root of the repo with your OpenAI API Key:

```bash
OPENAI_API_KEY=<YOUR_KEY>
```

**4. Run App**

```bash
npm run dev
```
