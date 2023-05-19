'use strict'
const ApplicationFactory = require("./factory/app.factory");

const Application = new ApplicationFactory(8080)
Application.listen()

