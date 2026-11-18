/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2704641423")

  // add field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "bool3016679131",
    "name": "dormindo",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2704641423")

  // remove field
  collection.fields.removeById("bool3016679131")

  return app.save(collection)
})
