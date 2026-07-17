# Basic Job Application Tracking App

## Version
0.0.3 - Updated to allow for tracking
- ML Match
- Change application status
- Sankey application flow

## Purpose
I created this just for the fun of it.  Its a Spec driven build in Kiro.  Application is a Docker 3 Tier build.  
```mermaid
flowchart TD
    Browser["Browser (User)"]
    subgraph Docker Compose
        UI["UI Service\n(Nginx + static HTML/JS/CSS)\nPort: UI_PORT"]
        API["API Service\n(Node.js / Express)\nPort: API_PORT"]
        DB["Database Service\n(MongoDB)\nInternal port 27017"]
    end

    Browser -->|HTTP| UI
    UI -->|REST JSON API calls| API
    API -->|MongoDB driver| DB
    DB -->|Named volume| Volume["mongo_data (named volume)"]
```
## Start Up
Run is controlled with Docker Compose
```
docker compose up --build
```

## Rebuild
To rebuild the container after changes:
```
docker compose down
docker compose up --build -d
```