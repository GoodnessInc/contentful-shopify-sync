# @goodness.inc/contentful-shopify-sync

Sync Shopify content to Contentful as entries

## Usage

```sh
npx @goodness.inc/contentful-shopify-sync products \
  --store-handles=store.myshopify.com,store-dev.myshopify.com \
  --storefront-access-tokens=abc123,def456 \
  --space-id=abc123 \
  --cma-access-token=abc123
```

Run `npx @goodness.inc/contentful-shopify-sync products --help` to see additional options.

### Actions

The expected use case is to call this from a GitHub action on some schedule to keep your Contentful Space up to date to new Products that have been added to Shopify. Here's an example workflow you can use:

```yml
name: 🔄 Sync

on:
  schedule:
    - cron: '0 8 * * *' # Runs daily at 12AM PST (8AM UTC)
  workflow_dispatch:

permissions:
  contents: read

env:
  PUBLIC_STOREFRONT_API_TOKEN_PROD: ${{ vars.PUBLIC_STOREFRONT_API_TOKEN_PROD }}
  PUBLIC_STOREFRONT_API_TOKEN_DEV: ${{ vars.PUBLIC_STOREFRONT_API_TOKEN_DEV }}
  PUBLIC_STORE_DOMAIN_PROD: ${{ vars.PUBLIC_STORE_DOMAIN_PROD }}
  PUBLIC_STORE_DOMAIN_DEV: ${{ vars.PUBLIC_STORE_DOMAIN_DEV }}
  CONTENTFUL_SPACE_ID: ${{ vars.CONTENTFUL_SPACE_ID }}
  CONTENTFUL_CMA_ACCESS_TOKEN: ${{ secrets.CONTENTFUL_CMA_ACCESS_TOKEN }}

jobs:
  products:
    name: Sync Shopify products to Contentful
    runs-on: ubuntu-latest

    steps:
      - name: Setup Node
        uses: actions/setup-node@v4

      - name: Run @goodness.inc/contentful-shopify-sync
        run: |
          npx @goodness.inc/contentful-shopify-sync products \
            --store-domains="${PUBLIC_STORE_DOMAIN_PROD},${PUBLIC_STORE_DOMAIN_DEV}" \
            --storefront-access-tokens="${PUBLIC_STOREFRONT_API_TOKEN_PROD},${PUBLIC_STOREFRONT_API_TOKEN_DEV}" \
            --space-id=${CONTENTFUL_SPACE_ID} \
            --cma-access-token=${CONTENTFUL_CMA_ACCESS_TOKEN}
```

## Contributing

To work on this locally, run `npm link` from this project to create a global symlink to this dir. Then, in one terminal run `yarn dev` (to build on code change) and in another run `contentful-shopify-sync` everytime you want to test execute.

### TODO

- [ ] Support more than 250 Products per Store
- [x] Un-publish / archive Contentful entries that are missing from Shopify
