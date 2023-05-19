const rootRouter = require('express').Router();
const dbClient = require('../db/db.service')

rootRouter.get('/', (req, res) => {
            res.send('FAST-SIMON NODEJS HOME TASK VERSION');
});
/** */
rootRouter.get('/get', async (req, res) => {
    const name = req.query.name;
    const value = await dbClient.getValue(name)
    res.send(value ? `${name}=${value}` : `None`);
});
/** */
rootRouter.get('/set', async (req, res) => {
    const name = req.query.name;
    const value = req.query.value;
    await dbClient.setValue({name,value})
    res.send(`${name}=${value}`);
});
/** */
rootRouter.get('/unset', async (req, res) => {
    const name = req.query.name;
    await dbClient.unset(name)
    res.send(`${name}=None`);
});
/** */
rootRouter.get('/end', async (req, res) => {
    await dbClient.clearData()
    res.send(`CLEANED`);
});
/** */
rootRouter.get('/numequalto', async (req, res) => { 
    const value = req.query.value;
    const counter = await dbClient.getCount(value)
    res.send(`${counter || 0}`);
})
/** */
rootRouter.get('/undo', async (req, res) => { 
    const result = await dbClient.undo()
    res.send(result);
})
/** */
rootRouter.get('/redo', async (req, res) => { 
    const result = await dbClient.redo()
    res.send(result);
})

module.exports = rootRouter;