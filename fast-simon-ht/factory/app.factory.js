const express = require('express'),
    router = require('../router/router')

class ApplicationFactory {
    PORT
    application = express()
    constructor(port){
        this.PORT = port
        this.application.use(router)
    }
    
    listen() {
        this.application.listen(this.PORT, () => {
        console.log(`Server listening on port ${this.PORT}...`);
        });
    }
}
module.exports = ApplicationFactory