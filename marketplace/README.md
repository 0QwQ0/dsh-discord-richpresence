# Marketplace submission

The catalog entry lives in `0QwQ0__dsh-discord-richpresence.yml`, ready to copy
into `data/plugins/` in
[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

The catalog requires a repository to be at least one day old and contain at
least ten commits before its pull request can pass CI. Submit the prepared file
only after the repository age requirement is satisfied, then run the catalog's
README generator as described in its contributing guide.

## Release convention for the `tarball:` field

The entry points at a **versionless asset on `releases/latest`**:

```yaml
tarball: https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence.tgz
```

That link only stays valid if every release carries an asset with exactly that
name, so **each release must upload a copy under the versionless name** (the
versioned archive can be published alongside it):

```sh
npm pack
gh release create v<version> --repo 0QwQ0/dsh-discord-richpresence --title "v<version>" --notes "<中文发布说明>"
gh release upload v<version> --repo 0QwQ0/dsh-discord-richpresence --clobber \
  dsh-discord-richpresence-<version>.tgz \
  dsh-discord-richpresence.tgz
```

This follows the catalog's convention of a versionless asset name so the entry
survives future releases without another pull request (see upstream #3056).

Editing the entry itself (description, category, tarball) is a separate pull
request that touches **only** this plugin's YAML file; the READMEs are generated
from `data/plugins/` by `node scripts/generate-readme.mjs`.
