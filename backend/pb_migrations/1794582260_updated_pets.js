/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2704641423")

  // add field
  collection.fields.addAt(8, new Field({
    "help": "",
    "hidden": false,
    "id": "json1780043509",
    "maxSize": 0,
    "name": "inventario",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "help": "",
    "hidden": false,
    "id": "json525575406",
    "maxSize": 0,
    "name": "equipados",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "json3037583757",
    "maxSize": 0,
    "name": "tarefas_recompensadas",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2704641423")

  // remove field
  collection.fields.removeById("json1780043509")

  // remove field
  collection.fields.removeById("json525575406")

  // remove field
  collection.fields.removeById("json3037583757")

  return app.save(collection)
})
