/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2687480828")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\" && user = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2687480828")

  // update collection data
  unmarshal({
    "listRule": null
  }, collection)

  return app.save(collection)
})
