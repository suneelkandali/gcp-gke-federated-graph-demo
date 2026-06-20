# GraphQL Federation on GKE — A Hands-On Learning Guide

A hands-on tutorial for learning how **Apollo Federation v2** and **GraphQL Subgraphs** work together. This project walks you through building a federated GraphQL API deployed on Google Kubernetes Engine (GKE), where two independent subgraphs — **Products** and **Reviews** — are composed into a single unified graph through an **Apollo Router**.

**What you'll learn:**

- How GraphQL Federation splits a schema across multiple services (subgraphs)
- How the `@key` and `@external` directives enable cross-service entity resolution
- How the Apollo Router composes subgraph schemas into a single federated endpoint
- How to deploy, test, and verify a federated graph on GKE

## Architecture

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

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` CLI)
- [Docker](https://docs.docker.com/get-docker/) with [Buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- A GCP project with billing enabled

## Dynamic Values Reference

Throughout this guide, you'll see placeholder values like `YOUR_PROJECT_ID` and `EXTERNAL_IP`. Use the commands below to obtain these values and set them as environment variables for convenience.

### Get Your GCP Project ID

```bash
# Option 1: Get from gcloud config (if you've run `gcloud init`)
gcloud config get-value project

# Option 2: List all projects you have access to
gcloud projects list

# Option 3: Get the project number (sometimes needed)
gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)"
```

Set it as an environment variable:

```bash
export PROJECT_ID=$(gcloud config get-value project)
echo "Your project ID: $PROJECT_ID"
```

### Get the Router External IP

After deploying the router service (see [Deploy to Kubernetes](#deploy-to-kubernetes)), retrieve the external IP:

```bash
# Option 1: One-liner to extract just the IP
export EXTERNAL_IP=$(kubectl get service router-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Router endpoint: http://$EXTERNAL_IP"

# Option 2: View the full service details
kubectl get service router-service

# Option 3: Watch for the IP to be provisioned (runs until IP appears)
kubectl get service router-service --watch
```

> **Note:** It may take 1-2 minutes for the external IP to be provisioned after deploying. If the IP shows `<pending>`, wait and run the command again.

### Get Your GCP Zone and Region

```bash
# Get your currently configured zone
gcloud config get-value compute/zone

# Get your currently configured region
gcloud config get-value compute/region

# List all available zones in a region
gcloud compute zones list --filter="region:us-central1"
```

### Summary of Variables

- **`PROJECT_ID`** — Your GCP project ID (e.g., `my-federation-demo`). Use `gcloud config get-value project` to retrieve it.
- **`EXTERNAL_IP`** — The public IP of the Apollo Router. Use `kubectl get service router-service` to retrieve it after deployment.
- **`ZONE`** — The GCP zone where your GKE cluster runs (e.g., `us-central1-a`). Use `gcloud config get-value compute/zone` to retrieve it.
- **`CLUSTER_NAME`** — Your GKE cluster name (e.g., `federation-demo-cluster`). Use `gcloud container clusters list` to retrieve it.

## Project Structure

```
gcp-gke-federated-graph-demo/
├── subgraphs/
│   ├── products/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── index.js
│   │   └── schema.graphql
│   ├── reviews/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── index.js
│   │   └── schema.graphql
│   └── router/
│       └── ...
├── k8s/
│   ├── products-deployment.yaml
│   ├── reviews-deployment.yaml
│   └── router-deployment.yaml
├── screenshots/
│   ├── 01-apollo-sandbox-landing.png
│   ├── 02-connect-endpoint.png
│   ├── 03-schema-explorer.png
│   ├── 04-execute-query.png
│   └── 05-single-product-query.png
└── README.md
```

## Setup

### 1. GCP Project & CLI Setup

```bash
# Initialize gcloud and select/create a project
gcloud init

# Update gcloud components
gcloud components update

# Enable required APIs
gcloud services enable container.googleapis.com
```

### 2. Create GKE Cluster

```bash
gcloud container clusters create federation-demo-cluster \
    --num-nodes=2 \
    --zone=us-central1-a \
    --machine-type=e2-standard-2 \
    --release-channel=regular
```

### 3. Configure kubectl

```bash
# Install GKE auth plugin
gcloud components install gke-gcloud-auth-plugin

# Get cluster credentials
gcloud container clusters get-credentials federation-demo-cluster \
    --zone us-central1-a

# Verify connection
kubectl config current-context
```

## Build & Push Docker Images

> **Important:** When building on macOS (Apple Silicon/ARM), you **must** specify `--platform linux/amd64` because GKE nodes run on AMD64 architecture. Building without this flag will result in `ImagePullBackOff` errors with the message `no match for platform in manifest: not found`.

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

## Deploy to Kubernetes

### Apply Manifests

```bash
# Deploy products subgraph
kubectl apply -f k8s/products-deployment.yaml

# Deploy reviews subgraph
kubectl apply -f k8s/reviews-deployment.yaml

# Deploy router (if applicable)
kubectl apply -f k8s/router-deployment.yaml
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

### Update Image on Existing Deployment

```bash
kubectl set image deployment/products-deployment \
    products=gcr.io/YOUR_PROJECT_ID/subgraph-products:NEW_TAG

kubectl set image deployment/reviews-deployment \
    reviews=gcr.io/YOUR_PROJECT_ID/subgraph-reviews:NEW_TAG
```

## Verify GraphQL Federation

After deploying all services, verify that the federated GraphQL API is working correctly.

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

### Test with cURL

#### 1. Query All Products with Reviews (Federated Query)

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
        "name": "Laptop",
        "price": 999.99,
        "reviews": [
          {
            "id": "101",
            "rating": 5,
            "comment": "Excellent laptop!"
          }
        ]
      },
      {
        "id": "2",
        "name": "Headphones",
        "price": 149.99,
        "reviews": [
          {
            "id": "102",
            "rating": 4,
            "comment": "Great sound quality"
          }
        ]
      }
    ]
  }
}
```

#### 2. Query a Single Product by ID

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProduct { product(id: \"1\") { id name price reviews { id rating comment } } }"}' \
  http://EXTERNAL_IP
```

#### 3. Query Only Products (No Reviews)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProductsOnly { products { id name price } }"}' \
  http://EXTERNAL_IP
```

#### 4. Using a Variable Query

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "query GetProduct($id: ID!) { product(id: $id) { id name price reviews { rating comment } } }", "variables": {"id": "1"}}' \
  http://EXTERNAL_IP
```

#### 5. Introspection Query (Verify Schema)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"query": "{ __schema { queryType { name } types { name kind } } }"}' \
  http://EXTERNAL_IP
```

> **Tip:** You can also pipe the response through `jq` for formatted output:
> ```bash
> curl -s -X POST \
>   -H "Content-Type: application/json" \
>   --data '{"query": "query GetFederatedProducts { products { id name price reviews { id rating comment } } }"}' \
>   http://EXTERNAL_IP | jq .
> ```

---

### Test with GraphQL Studio (Apollo Sandbox)

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

3. Click the **Run** button (▶️) or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Linux/Windows).
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
- **Operation Links** — Share query results by clicking **Share** in the response pane

---

### Quick Verification Checklist

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

## Troubleshooting

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

## Apollo Studio (Optional)

To connect to Apollo Studio for schema monitoring:

```bash
# Install Apollo Rover CLI
curl -sSL https://rover.apollo.dev/nix/latest | sh

# Set your Apollo key
export APOLLO_KEY=service:YOUR_GRAPH_ID:YOUR_KEY

# Set your graph ref
export GRAPH_REF=YOUR_GRAPH_ID@current

# Publish products subgraph schema (run from project root)
rover subgraph publish $GRAPH_REF \
    --name products \
    --schema ./subgraphs/products/schema.graphql \
    --routing-url http://products-service:4001/

# Publish reviews subgraph schema (run from project root)
rover subgraph publish $GRAPH_REF \
    --name reviews \
    --schema ./subgraphs/reviews/schema.graphql \
    --routing-url http://reviews-service:4002/