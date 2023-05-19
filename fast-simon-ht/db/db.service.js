const { Datastore } = require('@google-cloud/datastore');

class DBService {
    dbClient = new Datastore()
    StoredValueKind = 'StoredValue'
    ActionLogKind = 'ActionLog'
    actionTypes = {
        SET: 'SET',
        UNSET: 'UNSET',
        UNDO: 'UNDO',
    }
    /** */
    async getValue(valueName) {
         const query = this.dbClient
            .createQuery(this.StoredValueKind)
            .filter('name', '=', valueName)
            .select(['value'])
           
        const [entities] = await this.dbClient.runQuery(query);
        return entities.length > 0 ? entities[0].value : undefined
    }
    /** */
    async setValue(payload) {
        const name = payload.name
        const value = payload.value
        await this.deleteNextActionLogs(name)
        await this.createActionLog(name, value, this.actionTypes.SET)
        return await this.createNewValue(name, value)
    }
    /** */
    async createNewValue(name,value) {
        const storedValueEntity = {
            key: this.dbClient.key([this.StoredValueKind, name]),
            data: {
                name: name,
                value: value,
            }
            
        };
        return await this.dbClient.save(storedValueEntity)
    }
    /** */
    async createActionLog(name, value, actionType) {
        const query = this.dbClient.createQuery(this.ActionLogKind).filter('name', '=', name);
        const [actionLogs] = await this.dbClient.runQuery(query);
        const updatedActionLogs = actionLogs.map((actionLog) => ({
            key: actionLog[this.dbClient.KEY],
            data: {
            ...actionLog,
            is_active: false
            }
        }));
        await this.dbClient.save(updatedActionLogs);
        const actionLogEntity = {
                    key: this.dbClient.key([this.ActionLogKind]),
                    data: {
                        type: actionType,
                        name: name,
                        value: value,
                        is_active: true,
                        created_at: new Date()
                    }
        }
         await this.dbClient.save(actionLogEntity)
    }
    /** */
    async deleteNextActionLogs(nameOfValue) {
  
        const query = this.dbClient.createQuery(this.ActionLogKind)
            .filter('type', 'IN', [this.actionTypes.SET, this.actionTypes.UNSET])
            .filter('name', '=', nameOfValue)
            .filter('is_active', '=', true)
     
        const [logs] = await this.dbClient.runQuery(query);
        const lastLog = logs.length > 0 ? logs[0] : undefined

        if (lastLog) {
            const deleteQuery = this.dbClient
            .createQuery(this.ActionLogKind)
            .filter('name', '=', nameOfValue)
            .filter('is_active', '=', true)

            const [oldLogs] = await this.dbClient.runQuery(deleteQuery);
            const filteredLogs = oldLogs.filter(log => log.created_at > lastLog.created_at)
            
            if (filteredLogs.length > 0) {
                const deletePromises = [];
                filteredLogs.forEach(log => {
                    const key = log[this.dbClient.KEY];
                    deletePromises.push(this.dbClient.delete(key));
                });
                await Promise.all(deletePromises);
            }

            lastLog.is_active = false;
            await this.dbClient.save(lastLog);
        }
    }
    /** */
    async redo() {
        let result = 'NO COMMANDS'
        const query = this.dbClient
            .createQuery(this.ActionLogKind)
            .filter('type', 'IN', [this.actionTypes.SET, this.actionTypes.UNSET, this.actionTypes.UNDO])
            .filter('is_active', '=', true)
        const [logsRows] = await this.dbClient.runQuery(query);
      
        const orderedRows = logsRows.sort((a, b) => b.created_at - a.created_at)
        const currentLog = orderedRows.length > 0 ? orderedRows[0] : undefined
         if (currentLog) {
            
            const nextLogQuery = this.dbClient
                .createQuery(this.ActionLogKind)
                .filter('type', 'IN', [this.actionTypes.SET, this.actionTypes.UNSET, this.actionTypes.UNDO])
                .filter('name', '=', currentLog.name)
                .filter('is_active', '=', false)
            const [nextLogsRows] = await this.dbClient.runQuery(nextLogQuery);
            const nextOrderedRows = nextLogsRows.sort((a,b) => a.created_at - b.created_at)
             const nextLog = nextOrderedRows.length > 0 ? nextOrderedRows[0] : undefined
             const isLast = logsRows.filter(el => el.type !== this.actionTypes.UNDO).every(el => el.created_at < nextLog.created_at)
             if (nextLog && isLast) {
                 if (nextLog.type === this.actionTypes.UNSET) {
                     await this.deleteValue(nextLog.name)
                     result = `${currentLog.name}=None`
                 } else {
                    await this.createNewValue(nextLog.name, nextLog.value)
                    result = `${nextLog.name}=${nextLog.value}`
                 }

                nextLog.is_active = true
                await this.dbClient.save(nextLog)
                currentLog.is_active = false
                await this.dbClient.save(currentLog)
            }

        }
        return result
    }

    /** */
    async undo() {
        let result = 'NO COMMANDS'
         const query = this.dbClient
            .createQuery(this.ActionLogKind)
            .filter('type', 'IN', [this.actionTypes.SET, this.actionTypes.UNSET])
            .filter('is_active', '=', true)

        const [logsRows] = await this.dbClient.runQuery(query);
        const orderedRows = logsRows.sort((a,b) => b.created_at - a.created_at)
        const currentLog = orderedRows.length > 0 ? orderedRows[0] : undefined

        if (currentLog) {
            
            const prevLogQuery = this.dbClient
                .createQuery(this.ActionLogKind)
                .filter('type', 'IN', [this.actionTypes.SET, this.actionTypes.UNSET])
                .filter('name', '=', currentLog.name)
              
            const [prevLogsRows] = await this.dbClient.runQuery(prevLogQuery);
            const prevOrderedRows = prevLogsRows.filter(el => el.created_at < currentLog.created_at).sort((a,b) => b.created_at - a.created_at)
            const prevLog = prevOrderedRows.length > 0 ? prevOrderedRows[0] : undefined

            if (!prevLog) {
                await this.createActionLog(currentLog.name, currentLog.value, this.actionTypes.UNDO)
                await this.deleteValue(currentLog.name)
                result = `${currentLog.name}=None`
            } else {
                prevLog.is_active = true
                await this.dbClient.save(prevLog)
                await this.createNewValue(prevLog.name, prevLog.value)
                result = `${prevLog.name}=${prevLog.value}`
            }

            currentLog.is_active = false
            await this.dbClient.save(currentLog)
        }
        return result
    }
    /** */
    async deleteValue(valueName) {
        const query = this.dbClient
            .createQuery(this.StoredValueKind)
            .filter('name', '=', valueName);
            const [entities] = await this.dbClient.runQuery(query);
        if (entities.length > 0) {
            const keysToDelete = entities.map(entity => entity[this.dbClient.KEY]);
            await this.dbClient.delete(keysToDelete);
        }
    }
    /** */
    async unset(name) {
        const value = await this.getValue(name)
        if (value) {
            await this.deleteValue(name)
            await this.deleteNextActionLogs(name)
            await this.createActionLog(name, value, this.actionTypes.UNSET)
        }
    }
    /** */
    async clearData() {
        const queryStoredValue = this.dbClient.createQuery(this.StoredValueKind);
        const [storedValueEntities] = await this.dbClient.runQuery(queryStoredValue);
        const queryActionLogs = this.dbClient.createQuery(this.ActionLogKind);
        const [actionLogsEntities] = await this.dbClient.runQuery(queryActionLogs);
        const deletePromises = [];

        storedValueEntities.forEach(entity => {
            const key = entity[this.dbClient.KEY];
            deletePromises.push(this.dbClient.delete(key));
        });
        actionLogsEntities.forEach(entity => {
            const key = entity[this.dbClient.KEY];
            deletePromises.push(this.dbClient.delete(key));
        });
        await Promise.all(deletePromises);
    }
    /** */
    async getCount(value) {
        const query = this.dbClient.createQuery(this.StoredValueKind).filter('value', '=', value);
        return await this.dbClient.runQuery(query)
                .then(([entities]) => {
                return entities.length;
                });
    }
}

const DBClient = new DBService

module.exports = DBClient


