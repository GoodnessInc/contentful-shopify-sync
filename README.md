# contentful-shopify-sync

Sync Shopify content to Contentful as entries

## Usage

Add to your project and then execute through package manager, like:

```sh
yarn contentful-shopify-sync products \
  --store-handles=store.myshopify.com,store-dev.myshopify.com \
  --storefront-access-tokens=abc123,def456 \
  --space-id=abc123 \
  --cma-access-token=abc123
```

Run `yarn contentful-shopify-sync products --help` to see additional options.

### Actions

The expected use case is to call this from a GitHub action on some schedule to keep your Contentful Space up to date to new Products that have been added to Shopify.

## Contributing

To work on this locally, run `npm link` from this project to create a global symlink to this dir. Then, in one terminal run `yarn dev` (to build on code change) and in another run `yarn contentful-shopify-sync` everytime you want to test execute.

### TODO

- [ ] Support more than 250 Products per Store
- [x] Un-publish / archive Contentful entries that are missing from Shopify
