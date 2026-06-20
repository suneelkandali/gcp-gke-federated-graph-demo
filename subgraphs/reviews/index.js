const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');

const typeDefs = gql`
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
`;

const reviews = [
  { id: "101", productId: "1", rating: 5, comment: "Essential tool for system metrics!" },
  { id: "102", productId: "1", rating: 4, comment: "Great UI, needs minor bug fixes." },
  { id: "103", productId: "2", rating: 5, comment: "Flawless integration with Splunk/Docker." }
];

const resolvers = {
  Product: {
    reviews(product) {
      return reviews.filter(r => r.productId === product.id);
    }
  }
};

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers })
});

startStandaloneServer(server, { listen: { port: 4002 } }).then(({ url }) => {
  console.log(`🚀 Reviews subgraph ready at ${url}`);
});