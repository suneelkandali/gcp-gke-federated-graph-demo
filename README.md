# GraphQL Federation on GKE — A Hands-On Learning Guide

> 💻 **Important Note for Readers:** The terminal commands, setup steps, and package managers (such as Homebrew) used throughout this tutorial are explicitly tailored for macOS. If you are running Windows or Linux, you will need to adjust your local environment setup and CLI installations accordingly.

A complete guide to building and deploying an **Apollo Federation v2** GraphQL API on Google Kubernetes Engine (GKE), where two independent subgraphs — **Products** and **Reviews** — are composed into a single unified graph through an **Apollo Router**.

## What you will do

1. Install local tools 
2. Understand how GraphQL Federation splits a schema across multiple services.
3. Setup Apollo Studio for Federated graph
4. Authenticate Google Cloud
5. Create new project in Google cloud
6. Create a GKE cluster and connect `kubectl`.
7. Build and push Docker images for each subgraph to Google Container Registry (GCR).
8. Deploy the Products subgraph, Reviews subgraph, and Apollo Router to GKE.
9. Verify the federated GraphQL API with cURL and Apollo Sandbox.
10. Troubleshoot common issues.
11. Clean up resources when finished.

---

## 1. Prerequisites

You need the following installed on your computer:
- `gcloud`
- `kubectl`
- `docker` with [Buildx](https://docs.docker.com/buildx/working-with-buildx/)
- `rover`
- A GCP project with billing enabled

If you do not already have the required tools installed, follow these steps.

### Verify installed tools

Check that the required commands are already available before installing:

```bash
docker version
kubectl version --client
gcloud version
rover --version
```

If any command fails, install the missing tool using the instructions below.

### Install Docker

Download Docker Desktop for your platform from:
https://www.docker.com/get-started

After installation, verify Docker is running:

```bash
docker version
```

### Install kubectl

Follow the instructions at:
https://kubernetes.io/docs/tasks/tools/

For macOS with Homebrew:

```bash
brew install kubectl
```

Verify installation:

```bash
kubectl version --client
```

### Install Google Cloud SDK

1. Download and install the SDK for your platform from:
   https://cloud.google.com/sdk/docs/install
2. Confirm the SDK is installed and working:

```bash
gcloud version
```

### 3.2 Install Rover CLI

Rover is the Apollo command-line tool for working with your graph. Install it for your platform:

```bash
brew install apollographql/rover/rover
```

#### Verify Installation

```bash
rover --version
```

Expected output:

```
rover 0.2x.x (some hash)
```

### Authenticate with Google Cloud

1. Initialize the SDK and log in to your Google account:

```bash
gcloud init
```

2. Authenticate with your Google account:

```bash
gcloud auth login
```

3. Verify the active account and current configuration:

```bash
gcloud auth list

gcloud config list
```

### Create a Google Cloud project

If you do not already have a project, create one now:

```bash
gcloud projects create federated-graph-demo --name="Federated Graph Demo"
```

Enable billing and link it to your project using the Cloud Console (https://console.cloud.google.com/) if needed.

Set the active project:

```bash
gcloud config set project federated-graph-demo
```

### Enable required APIs

```bash
gcloud services enable container.googleapis.com
```

### Clone the repository

Clone the project repository from GitHub and navigate to the project folder:

```bash
git clone https://github.com/suneelkandali/gcp-gke-federated-graph-demo.git

cd gcp-gke-federated-graph-demo
```

All subsequent commands in this tutorial should be executed from within the `gcp-gke-federated-graph-demo` directory.

---

## 2. Understand the Architecture

This project demonstrates **Apollo Federation v2**, a pattern for building a single GraphQL API from multiple independent services (called **subgraphs**). An **Apollo Router** sits in front of the subgraphs and composes their schemas into a single unified endpoint.

### How Federation Works

- The **Products subgraph** owns the `Product` type and defines base fields (`id`, `name`, `price`).
- The **Reviews subgraph** extends the `Product` type by adding a `reviews` field, using the `@key` and `@external` directives to reference the Product entity.
- The **Apollo Router** queries both subgraphs and merges the results into a single response.

### Architecture Diagram

```
                    ┌──────────────┐
                    │    Router    │
                    │   (Port 4000)│
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼────────┐      ┌─────────▼────────┐
     │  Products API   │      │   Reviews API    │
     │  (Port 4001)    │      │   (Port 4002)    │
     └─────────────────┘      └──────────────────┘
```

### Project Structure

```
gcp-gke-federated-graph-demo/
├── subgraphs/
│   ├── products/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── index.js
│   │   └── schema.graphql
│   └── reviews/
│       ├── Dockerfile
│       ├── package.json
│       ├── index.js
│       └── schema.graphql
├── k8s/
│   ├── products-deployment.yaml
│   ├── reviews-deployment.yaml
│   └── router-deployment.yaml
├── screenshots/
│   └── README.md
└── README.md
```

### Products Subgraph Schema

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key"])

type Product @key(fields: "id") {
  id: ID!
  name: String!
  price: Float!
}

type Query {
  products: [Product!]!
  product(id: ID!): Product
}
```

### Reviews Subgraph Schema

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@external"])

type Review {
  id: ID!
  rating: Int!
  comment: String!
}

extend type Product @key(fields: "id") {
  id: ID! @external
  reviews: [Review!]!
}
```

---

## 3. Setup Apollo Studio for Federated graph

[Apollo Studio](https://studio.apollographql.com) is a cloud-based GraphQL platform that provides schema registry, performance metrics, operation tracking, and schema change validation for your federated graph. [Rover](https://www.apollographql.com/docs/rover/) is the official Apollo CLI used to publish and check your subgraph schemas against Apollo Studio.

### 3.1 Create an Apollo Studio Graph

1. Go to [https://studio.apollographql.com](https://studio.apollographql.com) and sign up or log in.

> ![Apollo GraphQL Studio - Create Graph option](screenshots/graphqlstudio-add-graph-option.png)

2. Click **New Graph** (or **Create a New Graph**).
3. Choose **Federated** as the graph type.
4. Give your graph a name (e.g., `My-Graph`) and select a **Deployment Region** close to your users.

> ![Apollo GraphQL Studio - Add Graph](screenshots/graphqlstudio-add-graph-option1.png)

5. Apollo Studio will generate a **Graph API Key** for you. Copy it — you will need it shortly.
6. Note your **Graph Reference** (also called `graph ref`), which has the format `Your-Graph-Name@current` (e.g., `My-Graph-9f5n9i@current`).

> ![Apollo GraphQL Studio - Graph config details](screenshots/graphqlstudio-add-graph-option2.png)

> **Important:** Keep your API key safe. It grants access to publish schemas and view metrics for your graph. Do not commit it to source control.

### 3.3 Authenticate Rover

Set your Apollo API key as an environment variable. Replace `service:YOUR_GRAPH_ID:YOUR_KEY` with the key you copied from Apollo Studio:

```bash
export APOLLO_KEY=service:YOUR_GRAPH_ID:YOUR_KEY
```

Set your graph reference:

```bash
export APOLLO_GRAPH_REF=YOUR_GRAPH_ID@current
```

> **Tip:** Add these `export` lines to your `~/.zshrc` so they persist across terminal sessions. Alternatively, use a `.env` file and source it before running Rover commands.

Verify Rover can connect to Apollo Studio:

```bash
rover config whoami
```

Expected output:

```
Apollo Graph Studio
├── Graph Name: My-Graph
├── Graph ID: YOUR_GRAPH_ID
└── Key Type: graph admin
```


> ![Rover - Graph config display](screenshots/rover-graph-details.png)
---


## 4. Create the GKE cluster

Run these commands in your terminal:

```bash
gcloud container clusters create federation-demo-cluster \
  --zone us-central1-a \
  --num-nodes=2 \
  --machine-type=e2-standard-2 \
  --release-channel=regular
```

Then connect `kubectl` to the cluster:

```bash
# Install GKE auth plugin
gcloud components install gke-gcloud-auth-plugin

# Get cluster credentials
gcloud container clusters get-credentials federation-demo-cluster \
  --zone us-central1-a

# Verify connection
kubectl config current-context
```

---

## 5. Build & Push Docker Images

> **Important:** When building on macOS (Apple Silicon/ARM), you **must** specify `--platform linux/amd64` because GKE nodes run on AMD64 architecture. Building without this flag will result in `ImagePullBackOff` errors.

### Configure Docker for GCR

```bash
gcloud auth configure-docker --quiet
```

### Build Products Subgraph

```bash
cd subgraphs/products

docker buildx build --no-cache \
    --platform linux/amd64 \
    --provenance=false --sbom=false \
    -t gcr.io/YOUR_PROJECT_ID/subgraph-products:1.0.3 \
    --push .
```

### Build Reviews Subgraph

```bash
cd subgraphs/reviews

docker buildx build --no-cache \
    --platform linux/amd64 \
    --provenance=false --sbom=false \
    -t gcr.io/YOUR_PROJECT_ID/subgraph-reviews:1.0.3 \
    --push .
```

Replace `YOUR_PROJECT_ID` with your actual GCP project ID. You can retrieve it with:

```bash
gcloud config get-value project
```

---

## 6. Deploy to Kubernetes

### Deploy Subgraphs

Deploy the Products and Reviews subgraphs first:

```bash
# Deploy products subgraph
kubectl apply -f k8s/products-deployment.yaml

# Deploy reviews subgraph
kubectl apply -f k8s/reviews-deployment.yaml
```

Wait for the subgraph pods to be running before proceeding:

```bash
kubectl get pods
```

Once the subgraphs are healthy, publish their schemas to Apollo Studio using Rover (see [Step 7.1 Publish Subgraph Schemas](#71-publish-subgraph-schemas)).

### Deploy Apollo Router

After publishing the subgraph schemas, deploy the Apollo Router:

```bash
# Deploy router
kubectl apply -f k8s/router-deployment.yaml
```

### Get the Router External IP

The Apollo Router is exposed via a `LoadBalancer` service. Retrieve its external IP:

```bash
kubectl get service router-service
```

Expected output:

```
NAME            TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)        AGE
router-service  LoadBalancer   10.x.x.x       34.67.230.190   80:3xxxx/TCP   5m
```

> **Note:** It may take 1-2 minutes for the external IP to be provisioned. Wait until the `EXTERNAL-IP` column shows an IP address instead of `<pending>`.

You can watch for the IP to appear:

```bash
kubectl get service router-service --watch
```

### Verify Deployment

```bash
# Check pods are running
kubectl get pods

# Expected output:
# NAME                                   READY   STATUS    RESTARTS   AGE
# products-deployment-xxx-yyy            1/1     Running   0          30s
# products-deployment-xxx-zzz            1/1     Running   0          30s
# reviews-deployment-xxx-yyy             1/1     Running   0          30s
# reviews-deployment-xxx-zzz             1/1     Running   0          30s

# Check deployments
kubectl get deployments

# Check services
kubectl get services
```

---

## 7. Publish Subgraph Schemas & Connect Apollo Studio

### 7.1 Publish Subgraph Schemas

The `--routing-url` should point to the Kubernetes **service DNS name** (not the external IP), since Rover runs from within or near the cluster network.

#### Publish the Products Subgraph

```bash
rover subgraph publish $APOLLO_GRAPH_REF \
    --name products \
    --schema ./subgraphs/products/schema.graphql \
    --routing-url http://products-service:4001/
```

Expected output:

```
🚀 Subgraph schemas published to 'My-Graph-9f5n9i@current'
  → Products subgraph: publish succeeded
  → No new schema changes detected (already up to date)
```

#### Publish the Reviews Subgraph

```bash
rover subgraph publish $APOLLO_GRAPH_REF \
    --name reviews \
    --schema ./subgraphs/reviews/schema.graphql \
    --routing-url http://reviews-service:4002/
```

After publishing both subgraphs, Apollo Studio will compose a supergraph schema and make it available to your Apollo Router.

### 7.2 Check Schema Changes (Optional but Recommended)

Before publishing, you can validate that your schema changes are compatible with the rest of the graph:

```bash
rover subgraph check $APOLLO_GRAPH_REF \
    --name products \
    --schema ./subgraphs/products/schema.graphql
```

This runs composition checks against the existing subgraphs in Apollo Studio and reports any breaking changes or composition errors.

### 7.3 View Your Graph in Apollo Studio

After publishing your subgraphs:

1. Go to [https://studio.apollographql.com](https://studio.apollographql.com).
2. Select your graph from the dashboard.
3. You will see:
   - **Schema** — The composed supergraph schema from both subgraphs.
   - **Explorer** — A query builder for testing operations against your graph.
   - **Metrics** — Performance data (once the router sends usage reports).
   - **Checks** — History of schema change validations.

### 7.4 Connect the Apollo Router to Apollo Studio

The Apollo Router is configured to report metrics to Apollo Studio via the environment variables in `k8s/router-deployment.yaml`:

```yaml
env:
- name: APOLLO_KEY
  value: "service:YOUR_GRAPH_ID:YOUR_KEY"
- name: APOLLO_GRAPH_REF
  value: "YOUR_GRAPH_ID@current"
```

Replace the placeholder values with your actual Apollo key and graph ref before deploying the router.

Once deployed, the router will:
- **Fetch the composed supergraph schema** from Apollo Studio at startup.
- **Report operation metrics** (latency, error rates, field usage) to Apollo Studio.
- **Receive schema updates** automatically when you publish new subgraph schemas via Rover.

### 7.5 Useful Rover Commands

```bash
# List all subgraphs in your graph
rover subgraph list $APOLLO_GRAPH_REF

# Get the composed supergraph schema
rover supergraph fetch $APOLLO_GRAPH_REF

# Get a subgraph's schema
rover subgraph fetch $APOLLO_GRAPH_REF --name products

# Check rover configuration
rover config list
```

### 7.6 Quick Reference — Rover + Apollo Studio

- **Install Rover (macOS/Linux):** `curl -sSL https://rover.apollo.dev/nix/latest | sh`
- **Install Rover (macOS Homebrew):** `brew install apollographql/rover/rover`
- **Verify identity:** `rover config whoami`
- **Publish a subgraph:** `rover subgraph publish $APOLLO_GRAPH_REF --name NAME --schema PATH --routing-url URL`
- **Check schema changes:** `rover subgraph check $APOLLO_GRAPH_REF --name NAME --schema PATH`
- **List subgraphs:** `rover subgraph list $APOLLO_GRAPH_REF`
- **View graph in browser:** Open [studio.apollographql.com](https://studio.apollographql.com)

---

## 8. Validate the deployment

After the workflow completes, confirm the federated GraphQL API is working correctly.

### 8.1 Check pods and services

Verify that all deployments are running and services are available:

```bash
kubectl get pods
kubectl get services
```

All pods should show `STATUS = Running` and the `router-service` should have an external IP.

### 8.2 Test with cURL

#### Query All Products with Reviews (Federated Query)

This query demonstrates Apollo Federation by fetching `Product` fields from the **Products** subgraph and `Review` fields from the **Reviews** subgraph in a single request:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetFederatedProducts { products { id name price reviews { id rating comment } } }"}' \
  http://EXTERNAL_IP
```

Replace `EXTERNAL_IP` with your router's external IP (e.g., `34.67.230.190`):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetFederatedProducts { products { id name price reviews { id rating comment } } }"}' \
  http://34.67.230.190
```

**Expected Response:**

```json
{
  "data": {
    "products": [
      {
        "id": "1",
        "name": "Enterprise Database Tool",
        "price": 299.99,
        "reviews": [
          {
            "id": "101",
            "rating": 5,
            "comment": "Essential tool for system metrics!"
          },
          {
            "id": "102",
            "rating": 4,
            "comment": "Great UI, needs minor bug fixes."
          }
        ]
      },
      {
        "id": "2",
        "name": "Cloud Log Aggregator Plugin",
        "price": 49.99,
        "reviews": [
          {
            "id": "103",
            "rating": 5,
            "comment": "Flawless integration with Splunk/Docker."
          }
        ]
      }
    ]
  }
}
```

#### Query a Single Product by ID

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProduct { product(id: \"1\") { id name price reviews { id rating comment } } }"}' \
  http://EXTERNAL_IP
```

#### Query Only Products (No Reviews)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProductsOnly { products { id name price } }"}' \
  http://EXTERNAL_IP
```

#### Using a Variable Query

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProduct($id: ID!) { product(id: $id) { id name price reviews { rating comment } } }", "variables": {"id": "1"}}' \
  http://EXTERNAL_IP
```

#### Introspection Query (Verify Schema)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "{ __schema { queryType { name } types { name kind } } }"}' \
  http://EXTERNAL_IP
```

> **Tip:** You can pipe the response through `jq` for formatted output:
> ```bash
> curl -s -X POST \
>   -H "Content-Type: application/json" \
>   --data '{"query": "query GetFederatedProducts { products { id name price reviews { id rating comment } } }"}' \
>   http://EXTERNAL_IP | jq .
> ```

### 8.3 Test with Apollo Sandbox

[Apollo Sandbox](https://studio.apollographql.com/sandbox) is a free, browser-based GraphQL IDE that provides auto-completion, schema documentation, and a query builder — making it ideal for exploring your federated graph.

#### Step 1: Open Apollo Sandbox

Open your browser and navigate to:

```
https://studio.apollographql.com/sandbox
```

> **Screenshot:** Opening Apollo Sandbox in the browser
>
> ![Apollo Sandbox Landing Page](screenshots/01-apollo-sandbox-landing.png)

#### Step 2: Connect to Your Router Endpoint

1. In the **URL bar** at the top of Apollo Sandbox, enter your router's endpoint URL:
   ```
   http://EXTERNAL_IP
   ```
   For example: `http://34.67.230.190`

2. Press **Enter** or click the **Connect** button.

> **Note:** Since the router is exposed over HTTP (not HTTPS), you may need to confirm a browser warning about loading an insecure page. Click **Continue** or **Proceed** to accept.

> **Screenshot:** Entering the router endpoint URL
>
> ![Connect to Router Endpoint](screenshots/02-connect-endpoint.png)

#### Step 3: Explore the Schema

Once connected, Apollo Sandbox automatically fetches and displays your federated schema:

1. Click the **Schema** tab (📚 icon) in the left sidebar.
2. You'll see the combined schema from both the **Products** and **Reviews** subgraphs:
   - `Product` type with fields: `id`, `name`, `price`, `reviews`
   - `Review` type with fields: `id`, `rating`, `comment`
   - `Query` type with: `products`, `product(id: ID!)`

> **Screenshot:** Viewing the federated schema in Apollo Sandbox
>
> ![Schema Explorer](screenshots/03-schema-explorer.png)

#### Step 4: Write and Execute a Query

1. Click the **Operations** tab (📝 icon) in the left sidebar.
2. Type your federated query in the query editor (left pane):

```graphql
query GetFederatedProducts {
  products {
    id
    name
    price
    reviews {
      id
      rating
      comment
    }
  }
}
```

3. Click the **Run** button (▶️) or press `Cmd+Enter`.
4. The response appears in the right pane, showing data from both subgraphs merged into a single response.

> **Screenshot:** Writing and running a federated query
>
> ![Execute Federated Query](screenshots/04-execute-query.png)

#### Step 5: Test a Single Product Query

Try a different query to fetch a single product by ID:

```graphql
query GetProduct {
  product(id: "1") {
    id
    name
    price
    reviews {
      rating
      comment
    }
  }
}
```

> **Screenshot:** Querying a single product with reviews
>
> ![Single Product Query](screenshots/05-single-product-query.png)

#### Apollo Sandbox Features to Explore

- **Auto-completion** — Press `Ctrl+Space` in the query editor to see available fields and types
- **Query History** — Click the clock icon (🕐) in the left sidebar to view previously executed queries
- **Variables** — Use the **Variables** tab below the query editor to pass dynamic values
- **Headers** — Click **Headers** to add custom HTTP headers (e.g., authentication tokens)
- **Schema Docs** — Click any type or field in the schema to see its documentation

### 8.4 Quick Verification Checklist

Use this checklist to confirm everything is working:

```bash
# 1. All pods are running
kubectl get pods
# All pods should show STATUS = Running

# 2. Router has an external IP
kubectl get service router-service
# EXTERNAL-IP should be an IP address (not <pending>)

# 3. CURL returns federated data
curl -s -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "{ products { id name reviews { rating } } }"}' \
  http://EXTERNAL_IP | jq .
# Should return JSON with products containing reviews

# 4. Apollo Sandbox connects successfully
# Open https://studio.apollographql.com/sandbox
# Enter your router URL and verify schema loads
```


---

## 9. Troubleshooting

### ImagePullBackOff / ErrImagePull

**Error:** `no match for platform in manifest: not found`

**Cause:** The Docker image was built for a different architecture (e.g., `linux/arm64` on macOS) than the GKE nodes (`linux/amd64`).

**Fix:** Rebuild with the correct platform flag:
```bash
docker buildx build --platform linux/amd64 -t gcr.io/PROJECT_ID/IMAGE:TAG --push .
```

### CrashLoopBackOff — `Cannot find module 'graphql-tag'`

**Cause:** The `graphql-tag` package was not listed in `package.json` dependencies but is required by the application code.

**Fix:** Add `graphql-tag` to `package.json` dependencies and rebuild the Docker image:
```bash
# In package.json, add to dependencies:
"graphql-tag": "^2.12.6"

# Then rebuild and push
docker buildx build --no-cache --platform linux/amd64 \
    -t gcr.io/PROJECT_ID/IMAGE:TAG --push .
```

### CrashLoopBackOff — `Unknown directive "@external"`

**Cause:** The GraphQL schema uses federation directives (`@external`) that are not imported in the `@link` directive.

**Fix:** Add the missing directive to the `@link` import list in your schema:
```graphql
extend schema @link(
  url: "https://specs.apollo.dev/federation/v2.7",
  import: ["@key", "@external"]
)
```

### Container `exec format error`

**Cause:** Docker Buildx attestation manifests can confuse containerd on GKE nodes.

**Fix:** Build without attestations:
```bash
docker buildx build --provenance=false --sbom=false \
    --platform linux/amd64 -t gcr.io/PROJECT_ID/IMAGE:TAG --push .
```

---

## 10. Clean up resources

When you are done, delete the GKE cluster:

```bash
gcloud container clusters delete federation-demo-cluster --zone us-central1-a
```

You can also remove the Docker images from GCR if desired:

```bash
gcloud container images delete gcr.io/YOUR_PROJECT_ID/subgraph-products:1.0.3 --quiet
gcloud container images delete gcr.io/YOUR_PROJECT_ID/subgraph-reviews:1.0.3 --quiet
```

---

## Useful Commands

```bash
# View pod logs
kubectl logs <pod-name>

# View logs for a specific app
kubectl logs -l app=products
kubectl logs -l app=reviews

# Describe a pod for debugging
kubectl describe pod <pod-name>

# Delete all pods (they will be recreated by ReplicaSets)
kubectl delete pods --all

# Rollout status
kubectl rollout status deployment/products-deployment
kubectl rollout status deployment/reviews-deployment

# Scale deployment
kubectl scale deployment/products-deployment --replicas=3
```

