#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const storefront_api_client_1 = require("@shopify/storefront-api-client");
const contentful_management_1 = require("contentful-management");
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
// CLI entrypoint
(0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .command('products', 'Sync Shopify products into Contentful', (yargs) => yargs
    .option('store-domains', {
    type: 'string',
    demandOption: true,
    describe: 'Comma-separated list of Shopify store domains (*.myshopify.com or custom domains)',
    coerce: (val) => val.split(','),
})
    .option('storefront-access-tokens', {
    type: 'string',
    demandOption: true,
    describe: 'Comma-separated list of Shopify Storefront access tokens',
    coerce: (val) => val.split(','),
})
    .option('space-id', {
    type: 'string',
    demandOption: true,
    describe: 'Contentful Space ID',
})
    .option('cma-access-token', {
    type: 'string',
    demandOption: true,
    describe: 'Contentful CMA Access Token',
})
    .option('content-type-id', {
    type: 'string',
    default: 'product',
    describe: 'Contentful content type ID to use for products',
})
    .option('handle-field-id', {
    type: 'string',
    default: 'handle',
    describe: 'Contentful field ID that stores Shopify product handle',
})
    .option('title-field-id', {
    type: 'string',
    default: 'internalTitle',
    describe: 'Contentful field ID that stores Shopify product title',
})
    // Validate counts match + non-empty arrays
    .check((argv) => {
    if (argv['store-domains'].length !==
        argv['storefront-access-tokens'].length) {
        throw new Error('The number of store handles must match the number of storefront access tokens');
    }
    return true;
}), async (argv) => {
    try {
        await syncProducts(argv);
        console.log('✅ Sync complete');
    }
    catch (err) {
        console.error('❌ Sync failed:', err);
        process.exit(1);
    }
})
    .demandCommand(1, 'You need to provide a command')
    .help()
    .strict()
    .parse();
// Begin handling the "products" command
async function syncProducts({ storeDomains, storefrontAccessTokens, spaceId, cmaAccessToken, contentTypeId, handleFieldId, titleFieldId, }) {
    const contentfulClient = await makeContentfulClient({
        spaceId,
        cmaAccessToken,
    });
    const shopifyProducts = await getDistinctShopifyProducts(storeDomains, storefrontAccessTokens);
    console.log(`🔎 Found ${shopifyProducts.length} distinct products`);
    for (const [index, shopifyProduct] of shopifyProducts.entries()) {
        console.log(`➡️  Syncing product ${index + 1}/${shopifyProducts.length}:`, shopifyProduct.title);
        const entry = await createContentfulEntryIfMissing({
            contentfulClient,
            shopifyProduct,
            contentTypeId,
            handleFieldId,
            titleFieldId,
        });
    }
}
// Get all distinct products across multiple Shopify stores
async function getDistinctShopifyProducts(storeDomains, storefrontAccessTokens) {
    const groupedProps = storeDomains.map((domain, i) => ({
        storeDomain: domain,
        storefrontAccessToken: storefrontAccessTokens[i],
    }));
    const allStoresProducts = await Promise.all(groupedProps.map(getProductsForStore));
    // Return distinct products
    return allStoresProducts.reduce((distinctProducts, products) => {
        for (const product of products) {
            if (!distinctProducts.find(({ handle }) => handle === product.handle)) {
                distinctProducts.push(product);
            }
        }
        return distinctProducts;
    }, []);
}
// Get all product handles for a single store, currenlty limited to 250 products
async function getProductsForStore({ storeDomain, storefrontAccessToken, }) {
    const client = (0, storefront_api_client_1.createStorefrontApiClient)({
        storeDomain,
        apiVersion: '2025-07',
        publicAccessToken: storefrontAccessToken,
    });
    const { data, errors } = await client.request(`
    query {
      products(first: 250) {
        nodes {
          title
          handle
        }
      }
    }
  `);
    if (errors)
        throw new Error(JSON.stringify(errors));
    return data?.products.nodes || [];
}
async function createContentfulEntryIfMissing({ contentfulClient, shopifyProduct, contentTypeId, handleFieldId, titleFieldId, }) {
    const entry = await findEntryByHandle({
        contentfulClient,
        handle: shopifyProduct.handle,
        contentTypeId,
        handleFieldId,
    });
    // If entry exists, so return it
    if (entry)
        return entry;
    // Otherwise create it
    const newEntry = await contentfulClient.createEntry(contentTypeId, {
        fields: {
            [handleFieldId]: { 'en-US': shopifyProduct.handle },
            [titleFieldId]: { 'en-US': shopifyProduct.title },
        },
    });
    await newEntry.publish(); // I think we'll always want to auto-publish it
    return newEntry;
}
async function findEntryByHandle({ contentfulClient, handle, contentTypeId, handleFieldId, }) {
    const entries = await contentfulClient.getEntries({
        content_type: contentTypeId,
        [`fields.${handleFieldId}`]: handle,
        limit: 1,
    });
    return entries.items[0];
}
async function makeContentfulClient({ spaceId, cmaAccessToken, }) {
    const environmentId = 'master';
    return (0, contentful_management_1.createClient)({
        accessToken: cmaAccessToken,
    })
        .getSpace(spaceId)
        .then((space) => space.getEnvironment(environmentId));
}
