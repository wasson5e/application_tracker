# Basic Job Application Tracking App

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

Run is controlled with Docker Compose
```
docker compose up --build
```

