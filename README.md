# contentful-shopify-sync

Sync Shopify content to Contentful as entries

## Usage

Add to your project and then execute through package manager, like:

```sh
yarn contentful-shopify-sync products \
  --shopify-store-handles=store-1,store-1-dev \
  --shopify-storefront-access-tokens=abc123,def456 \
  --contentful-space-id=abc123
```

### Actions

The expected use case is to call this from a GitHub action on some schedule to keep your Contentful Space up to date to new Products that have been added to Shopify.

## Development

To work on this locally, run `npm link` from this project to create a global symlink to this dir. Then, in one terminal run `yarn dev` (to build on code change) and in another run `yarn contentful-shopify-sync` everytime you want to test execute.
