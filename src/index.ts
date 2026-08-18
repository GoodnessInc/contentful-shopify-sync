#!/usr/bin/env node
import {createStorefrontApiClient} from '@shopify/storefront-api-client';
import {createClient as createContentfulClient} from 'contentful-management';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

type ProductsArgs = {
  storeDomains: string[];
  storefrontAccessTokens: string[];
  spaceId: string;
  cmaAccessToken: string;
  contentTypeId: string;
  handleFieldId: string;
  titleFieldId: string;
  disableUnpublish: boolean;
};

// CLI entrypoint
yargs(hideBin(process.argv))
  .command<ProductsArgs>(
    'products',
    'Sync Shopify products into Contentful',
    (yargs) =>
      yargs
        .option('store-domains', {
          type: 'string',
          demandOption: true,
          describe:
            'Comma-separated list of Shopify store domains (*.myshopify.com or custom domains)',
          coerce: (val: string) => val.split(','),
        })
        .option('storefront-access-tokens', {
          type: 'string',
          demandOption: true,
          describe: 'Comma-separated list of Shopify Storefront access tokens',
          coerce: (val: string) => val.split(','),
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
        .option('disable-unpublish', {
          type: 'boolean',
          describe:
            'Disable unpublishing entries that lack a matching Shopify product',
        })
        // Validate counts match + non-empty arrays
        .check((argv) => {
          if (
            argv['store-domains'].length !==
            argv['storefront-access-tokens'].length
          ) {
            throw new Error(
              'The number of store handles must match the number of storefront access tokens',
            );
          }
          return true;
        }),
    async (argv) => {
      try {
        await syncProducts(argv);
        console.log('✅ Sync complete');
      } catch (err) {
        console.error('❌ Sync failed:', err);
        process.exit(1);
      }
    },
  )
  .demandCommand(1, 'You need to provide a command')
  .help()
  .strict()
  .parse();

// Begin handling the "products" command
async function syncProducts({
  storeDomains,
  storefrontAccessTokens,
  spaceId,
  cmaAccessToken,
  contentTypeId,
  handleFieldId,
  titleFieldId,
  disableUnpublish,
}: ProductsArgs) {
  const contentfulClient = await makeContentfulClient({
    spaceId,
    cmaAccessToken,
  });

  // Get Shopify products across multiple stores
  const shopifyProducts = await getDistinctShopifyProducts(
    storeDomains,
    storefrontAccessTokens,
  );
  console.log(`🔎 Found ${shopifyProducts.length} distinct products`);

  // Ensure all of these products are available in Contentful
  for (const [index, shopifyProduct] of shopifyProducts.entries()) {
    console.log(
      `➡️  Syncing product ${index + 1}/${shopifyProducts.length}:`,
      shopifyProduct.title,
    );
    await createContentfulEntryIfMissing({
      contentfulClient,
      shopifyProduct,
      contentTypeId,
      handleFieldId,
      titleFieldId,
    });
  }

  // Unpublish any Contentful entries lack a atching Shopify product
  if (!disableUnpublish) {
    // Find entries to unpublish
    const publishedEntries = await getPublishedEntries({
      contentfulClient,
      contentTypeId,
    });
    const entriesToUnpublish = publishedEntries.filter((entry) => {
      const handle = entry.fields[handleFieldId]?.['en-US'];
      return handle && !shopifyProducts.find((p) => p.handle === handle);
    });

    // Do the unpublishing
    console.log(`🔎 Found ${entriesToUnpublish.length} entries to unpublish`);
    for (const [index, entry] of entriesToUnpublish.entries()) {
      console.log(
        `🗑️ Unpublishing entry ${index + 1}/${entriesToUnpublish.length}:`,
        entry.fields[titleFieldId]?.['en-US'] || 'Unknown title',
      );
      await entry.unpublish();
    }
  }
}

// Get all distinct products across multiple Shopify stores
async function getDistinctShopifyProducts(
  storeDomains: string[],
  storefrontAccessTokens: string[],
) {
  const groupedProps = storeDomains.map((domain, i) => ({
    storeDomain: domain,
    storefrontAccessToken: storefrontAccessTokens[i],
  }));
  const allStoresProducts = await Promise.all(
    groupedProps.map(getProductsForStore),
  );

  // Return distinct products
  return allStoresProducts.reduce((distinctProducts, products) => {
    for (const product of products) {
      if (!distinctProducts.find(({handle}) => handle === product.handle)) {
        distinctProducts.push(product);
      }
    }
    return distinctProducts;
  }, [] as ShopifyProduct[]);
}

// Get all products for a single store, paginating through the full result set
async function getProductsForStore({
  storeDomain,
  storefrontAccessToken,
}: {
  storeDomain: string;
  storefrontAccessToken: string;
}) {
  const client = createStorefrontApiClient({
    storeDomain,
    apiVersion: '2025-07',
    publicAccessToken: storefrontAccessToken,
  });

  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  while (true) {
    type ProductsResponse = {
      products: {nodes: ShopifyProduct[]; pageInfo: {hasNextPage: boolean; endCursor: string}};
    };
    const result: {data?: ProductsResponse; errors?: unknown} = await client.request<ProductsResponse>(
      `
      query ($after: String) {
        products(first: 250, after: $after) {
          nodes {
            title
            handle
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
      {variables: {after: cursor}},
    );
    if (result.errors) throw new Error(JSON.stringify(result.errors));
    const page: ProductsResponse['products'] | undefined = result.data?.products;
    if (!page) break;
    products.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (!cursor) break;
  }

  return products;
}

// Create a Contentful entry for the given Shopify product if it doesn't
// already exist
async function createContentfulEntryIfMissing({
  contentfulClient,
  shopifyProduct,
  contentTypeId,
  handleFieldId,
  titleFieldId,
}: {
  contentfulClient: ContentfulClient;
  shopifyProduct: ShopifyProduct;
  contentTypeId: string;
  handleFieldId: string;
  titleFieldId: string;
}) {
  const entry = await findEntryByHandle({
    contentfulClient,
    handle: shopifyProduct.handle,
    contentTypeId,
    handleFieldId,
  });

  // Re-publish if it exists but is unpublished but not archived. If archived,
  // assuming this was intentionally hidden
  if (entry) {
    if (!entry.isPublished() && !entry.isArchived()) {
      await entry.publish();
    }
    return entry;
  }

  // Otherwise create it
  const newEntry = await contentfulClient.createEntry(contentTypeId, {
    fields: {
      [handleFieldId]: {'en-US': shopifyProduct.handle},
      [titleFieldId]: {'en-US': shopifyProduct.title},
    },
  });
  await newEntry.publish(); // I think we'll always want to auto-publish it
  return newEntry;
}

// Find a Contentful entry by its Shopify handle
async function findEntryByHandle({
  contentfulClient,
  handle,
  contentTypeId,
  handleFieldId,
}: {
  contentfulClient: ContentfulClient;
  handle: string;
  contentTypeId: string;
  handleFieldId: string;
}) {
  const entries = await contentfulClient.getEntries({
    content_type: contentTypeId,
    [`fields.${handleFieldId}`]: handle,
    limit: 1,
  });
  return entries.items[0];
}

// Get all published entries of the given content type, paginating through the full result set
async function getPublishedEntries({
  contentfulClient,
  contentTypeId,
}: {
  contentfulClient: ContentfulClient;
  contentTypeId: string;
}) {
  const pageSize = 200;
  let skip = 0;
  const allItems: Awaited<ReturnType<ContentfulClient['getPublishedEntries']>>['items'] = [];

  let page: Awaited<ReturnType<ContentfulClient['getPublishedEntries']>>;
  do {
    page = await contentfulClient.getPublishedEntries({
      content_type: contentTypeId,
      limit: pageSize,
      skip,
    });
    allItems.push(...page.items);
    skip += pageSize;
  } while (page.items.length === pageSize);

  return allItems;
}

// Create a Contentful Management API client and get the desired environment
async function makeContentfulClient({
  spaceId,
  cmaAccessToken,
}: {
  spaceId: string;
  cmaAccessToken: string;
}) {
  const environmentId = 'master';
  return createContentfulClient({
    accessToken: cmaAccessToken,
  })
    .getSpace(spaceId)
    .then((space) => space.getEnvironment(environmentId));
}

type ContentfulClient = Awaited<ReturnType<typeof makeContentfulClient>>;

type ShopifyProduct = {
  handle: string;
  title: string;
};
