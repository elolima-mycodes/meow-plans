/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2238387850")

  // update field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "bool989355118",
    "name": "completa",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2238387850")

  // update field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "bool989355118",
    "name": "completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
})
