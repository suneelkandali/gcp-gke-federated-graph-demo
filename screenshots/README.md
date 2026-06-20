# Screenshots

This directory contains screenshots referenced in the main README.md for the GraphQL testing section.

## Required Screenshots

To complete the documentation, capture the following screenshots after deploying the federated graph:

- **`01-apollo-sandbox-landing.png`** — Apollo Sandbox landing page. Open [https://studio.apollographql.com/sandbox](https://studio.apollographql.com/sandbox) and take a screenshot of the initial page.
- **`02-connect-endpoint.png`** — Connecting the router endpoint. Enter your router's external IP (`http://EXTERNAL_IP`) in the URL bar and screenshot the connection.
- **`03-schema-explorer.png`** — Schema documentation view. Click the Schema tab (📚) in the left sidebar after connecting and screenshot the schema view.
- **`04-execute-query.png`** — Running a federated query. Type the `GetFederatedProducts` query, run it, and screenshot the query + response.
- **`05-single-product-query.png`** — Single product query result. Run the `GetProduct` query and screenshot the query + response.

## How to Capture

1. Deploy all services and obtain the router's external IP
2. Open [https://studio.apollographql.com/sandbox](https://studio.apollographql.com/sandbox)
3. Follow the steps in the main README to connect and test
4. Take screenshots at each step using your preferred screenshot tool:
   - **macOS**: `Cmd+Shift+4` (area) or `Cmd+Shift+3` (full screen)
   - **Windows**: `Win+Shift+S` (Snipping Tool)
   - **Linux**: `gnome-screenshot` or `scrot`
5. Save the screenshots in this directory with the exact filenames listed above