/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2716528959")

  // update field
  collection.fields.addAt(6, new Field({
    "help": "",
    "hidden": false,
    "id": "bool1804889986",
    "name": "is_recurring",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2716528959")

  // update field
  collection.fields.addAt(6, new Field({
    "help": "",
    "hidden": false,
    "id": "bool1804889986",
    "name": "is_recurring",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
})
