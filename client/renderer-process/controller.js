// Imports
const project = require('./project')
const application = require('./application')
const editor = require('./editor')
const assets = require('./assets')
const network = require('./network')
const status = require('./status') // jshint ignore: line

const windowStateKeeper = require('electron-window-state')
const remote = require('electron').remote
const BrowserWindow = remote.BrowserWindow
const sizeOf = require('image-size')
const babble = require('babble.js')
const fs = require('fs-extra')
const path = require('path')
const url = require('url')

const settings = remote.require('./main-process/settings')

// Vars
let stage
let puppet
let character
let hotbar = []
let popout
let popoutWindowState

exports.init = function() {
    application.init()
    stage = new babble.Stage('screen', Object.assign({}, project.project), project.assets, project.assetsPath, loadPuppets, status)
    window.addEventListener('resize', () => {stage.resize(); stage.resize()})

    popoutWindowState = windowStateKeeper({
        file: 'popout-window.json',
        defaultWidth: 800,
        defaultHeight: 600
    })
}

exports.setPuppetLocal = function(index, shiftKey, ctrlKey) {
    if (!hotbar[index]) return

    let newPuppet
    let oldcharacter = character
    character = JSON.parse(JSON.stringify(project.characters[project.project.hotbar[index]]))

    if (shiftKey && !ctrlKey) {
        character.head = oldcharacter.head
        character.hat = oldcharacter.hat
        character.emotes = oldcharacter.emotes
        character.mouths = oldcharacter.mouths
        character.eyes = oldcharacter.eyes
        newPuppet = stage.createPuppet(character)
    } else if (!shiftKey && ctrlKey) {
        character.body = oldcharacter.body
        character.props = oldcharacter.props
        newPuppet = stage.createPuppet(character)
    } else {
        newPuppet = hotbar[index]
    }

    // Set Puppet
    stage.setPuppet(puppet.id, newPuppet)
    puppet = newPuppet

    // Update Editor
    application.setPuppet(index, puppet.emotes)

    // Update Project
    project.actor.id = project.project.hotbar[index]

    // Update Server
    let tempPuppet = JSON.parse(JSON.stringify(character))
    tempPuppet.position = project.actor.position
    tempPuppet.emote = project.actor.emote
    tempPuppet.facingLeft = project.actor.facingLeft
    network.emit('set puppet', puppet.id, tempPuppet)

    // Update popout
    if (popout) popout.webContents.send('set puppet', puppet.id, tempPuppet)
}

exports.setEmoteLocal = function(emote) {
    // Change Emote
    exports.setEmote(puppet.id, emote)

    // Update Editor
    application.setEmote(puppet.emote)

    // Update Project
    project.actor.emote = emote

    // Update Server
    network.emit('set emote', puppet.id, emote)
}

exports.moveLeftLocal = function() {
    // Move Left
    exports.moveLeft(puppet.id)

    // Update Project
    project.actor.facingLeft = puppet.facingLeft
    project.actor.position = ((puppet.target % (project.project.numCharacters + 1)) + (project.project.numCharacters + 1)) % (project.project.numCharacters + 1)

    // Update Server
    network.emit('move left', puppet.id)
}

exports.moveRightLocal = function() {
    // Move Right
    exports.moveRight(puppet.id)

    // Update Project
    project.actor.facingLeft = puppet.facingLeft
    project.actor.position = puppet.target % (project.project.numCharacters + 1)

    // Update Server
    network.emit('move right', puppet.id)
}

exports.startBabblingLocal = function() {
    // Start Babbling
    exports.startBabbling(puppet.id)

    // Update Editor
    application.setBabble(true)

    // Update Server
    network.emit('start babbling', puppet.id)
}

exports.stopBabblingLocal = function() {
    // Stop Babbling
    exports.stopBabbling(puppet.id)

    // Update Editor
    application.setBabble(false)

    // Update Server
    network.emit('stop babbling', puppet.id)
}

exports.jiggleLocal = function() {
    // Jiggle
    exports.jiggle(puppet.id)

    // Update Server
    network.emit('jiggle', puppet.id)
}

exports.banishLocal = function() {
    // Banish
    exports.banish()

    // Update server
    network.emit('banish')
}

exports.setPuppet = function(id, puppet) {
    // Set Puppet
    stage.setPuppet(id, stage.createPuppet(puppet))

    // Update popout
    if (popout) popout.webContents.send('set puppet', id, puppet)
}

exports.setEmote = function(id, emote) {
    // Change Emote
    stage.getPuppet(id).changeEmote(emote)

    // Update popout
    if (popout) popout.webContents.send('set emote', id, emote)
}

exports.moveLeft = function(id) {
    let puppet = stage.getPuppet(id)

    // Move Left
    puppet.moveLeft()

    // Update popout
    if (popout) popout.webContents.send('move left', id)

    return puppet
}

exports.moveRight = function(id) {
    let puppet = stage.getPuppet(id)

    // Move Right
    puppet.moveRight()

    // Update popout
    if (popout) popout.webContents.send('move right', id)

    return puppet
}

exports.startBabbling = function(id) {
    // Start Babbling
    stage.getPuppet(id).setBabbling(true)

    // Update popout
    if (popout) popout.webContents.send('start babbling', id)
}

exports.stopBabbling = function(id) {
    // Stop Babbling
    stage.getPuppet(id).setBabbling(false)

    // Update popout
    if (popout) popout.webContents.send('stop babbling', id)
}

exports.jiggle = function(id) {
    // Jiggle
    stage.getPuppet(id).jiggle()

    // Update popout
    if (popout) popout.webContents.send('jiggle', id)
}

exports.banish = function() {
    // Banish
    stage.banishPuppets()

    // Update popout
    if (popout) popout.webContents.send('banish')
}

exports.togglePopout = function() {
    if (popout) popIn()
    else popOut()
}

exports.emitPopout = function(...args) {
    if (popout) popout.webContents.send(...args)
}

exports.setupPopout = function() {
    exports.emitPopout('setup', project, project.getPuppet(), puppet.id)
    exports.resize()
}

exports.initPopout = function() {
    let puppets = network.getPuppets()
    let characters = []
    for (let i = 0; i < puppets.length; i++) {
        let puppet = stage.getPuppet(puppets[i].charId)
        let character = puppets[i]
        character.position = puppet.position
        character.facingLeft = puppet.facingLeft
        character.emote = puppet.emote
        characters.push(character)
    }
    exports.emitPopout('init', characters)
}

exports.resize = function() {
    let puppetScale = network.isNetworking ? project.network.puppetScale : project.project.puppetScale
    let numCharacters = network.isNetworking ? project.network.numCharacters : project.project.numCharacters
    stage.project.puppetScale = puppetScale
    stage.project.numCharacters = numCharacters
    stage.resize()
    editor.resize()
    exports.emitPopout('resize', puppetScale, numCharacters)
}

exports.updateHotbar = function(i, puppet) {
    project.project.hotbar[i] = parseInt(puppet)
    if (puppet === '') {
        hotbar[i] = null
    } else {
        hotbar[i] = stage.createPuppet(project.characters[puppet])
    }
}

exports.addAsset = function(id, asset) {
    exports.addAssetLocal(id, asset)
    network.emit('add asset', id, asset)
}

exports.addAssetLocal = function(id, asset) {
    let oldVersion = project.assets[id] ? project.assets[id].version : asset.version
    asset.location = asset.location.replace(/\\/g, '/')
    project.addAsset(id, asset)
    stage.addAsset(id, asset, () => {
        let location = asset.location
        location = [location.slice(0, location.length - 4), '.thumb', location.slice(location.length - 4)].join('')
        if (asset.type === 'animated' && !fs.existsSync(path.join(project.assetsPath, location))) {
            let dimensions = sizeOf(path.join(project.assetsPath, asset.location))
            let width = Math.floor(dimensions.width / asset.cols)
            let height = Math.floor(dimensions.height / asset.rows)
            let image = new Image()
            image.onload = () => {
                let canvas = document.createElement('canvas')
                canvas.width = dimensions.width
                canvas.height = dimensions.height
                canvas.getContext('2d').drawImage(image, 0, 0)
                let data = canvas.getContext('2d').getImageData(0, 0, width, height)
                canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                canvas.getContext('2d').putImageData(data, 0, 0)
                fs.writeFile(path.join(project.assetsPath, location), new Buffer(canvas.toDataURL().replace(/^data:image\/\w+;base64,/, ''), 'base64'), (err) => {
                    if (err) console.log(err)
                    assets.addAsset(id)
                })
            }
            image.src = path.join(project.assetsPath, asset.location)
        } else assets.addAsset(id)
        exports.emitPopout('add asset', id, asset)
    })
    for (let i = oldVersion; i < asset.version; i++) {
        if (asset.panning[i])
            exports.moveAsset(id, asset.panning[i].x, asset.panning[i].y)
    }
}

exports.deleteAsset = function(id) {
    exports.deleteAssetLocal(id)
    network.emit('delete asset', id)
}

exports.deleteAssetLocal = function(id) {
    status.log('Deleting asset...', 2, 1)
    assets.deleteAsset(id)
    project.deleteAsset(id)

    applyToAsset(id, (asset, array, index) => {
        array.splice(index, 1)
    }, true)
    status.log('Deleted asset!', 1, 1)
}

exports.renameAssetList = function(tab, newTab) {
    exports.renameAssetListLocal(tab, newTab)
    network.emit('rename asset list', tab, newTab)
    let keys = Object.keys(project.assets)
    for (let i = 0; i < keys.length; i++) {
        if (project.assets[keys[i]].tab === tab) {
            project.assets[keys[i]].tab = newTab
            exports.updateAsset(keys[i])
        }
    }
}

exports.renameAssetListLocal = function(tab, newTab) {
    assets.renameAssetList(tab, newTab)
}

exports.moveAsset = function(id, x, y) {
    let callback = function(asset) {
        asset.x += Math.cos(asset.rotation) * x - Math.sin(asset.rotation) * y
        asset.y += Math.cos(asset.rotation) * y + Math.sin(asset.rotation) * x
    }
    applyToAsset(id, callback, true)
    editor.moveAsset(id, x, y)
}

exports.reloadAsset = function(id) {
    stage.updateAsset(id)
    editor.updateAsset(id)
    assets.reloadAsset(id)
    exports.emitPopout('reload asset', id, project.assets[id])
    let callback = function(asset, sprite) {
        let parent = sprite.parent
        let index = parent.getChildIndex(sprite)
        let newAsset = stage.getAsset(asset)
        newAsset.layer = asset.layer
        newAsset.emote = asset.emote
        parent.removeChildAt(index)
        parent.addChildAt(newAsset, index)
    }
    for (let i = 0; i < hotbar.length; i++) {
        hotbar[i].applyToAsset(id, callback)
    }
}

exports.updateAsset = function(id, x, y) {
    if (x || y) {
        project.assets[id].panning[project.assets[id].version] = {x, y}
        exports.moveAsset(id, x, y)
    }
    project.assets[id].version++
    exports.updateAssetLocal(id, project.assets[id])
    network.emit('add asset', id, project.assets[id])
}

exports.updateAssetLocal = function(id, asset) {
    stage.addAsset(id, asset, () => {
        project.addAsset(id, asset)
        exports.reloadAsset(id)
        assets.reloadAsset(id)
    })
}

exports.reloadAssets = function(callback) {
    stage.reloadAssets(() => {
        assets.reloadAssets()
        if(callback) callback()
        project.saveProject()
        editor.reloadPuppetList()
    })
}

exports.pruneAssets = function() {
    let keys = Object.keys(project.assets)
    let foundAsset = false
    let callback = function() {
        foundAsset = true
    }
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].split(':')[0] !== settings.settings.uuid) {
            applyToAsset(keys[i], callback, true)
            if (!foundAsset) {
                exports.deleteAsset(keys[i])
            } else foundAsset = false
        }
    }
}

exports.reloadPuppets = function() {
    stage.reloadPuppets()
}

exports.deleteAssetList = function(tab) {
    exports.deleteAssetListLocal(tab)
    network.emit('delete asset list', tab)
}

exports.deleteAssetListLocal = function(tab) {
    let keys = Object.keys(project.assets)
    for (let i = 0; i < keys.length; i++) {
        if (project.assets[keys[i]].tab === tab) {
            exports.deleteAsset(keys[i])
            project.deleteAsset(keys[i])
        }
    }
    assets.deleteAssetList(tab)
}

exports.deleteCharacter = function(character) {
    let index = project.project.hotbar.indexOf(character.id)
    if (index > -1) {
        hotbar[index] = null
        project.project.hotbar[index] = parseInt('')
        application.deleteCharacter(index)
    }
}

exports.updateCharacter = function(index, character) {
    hotbar[index] = stage.createPuppet(character)
}

exports.saveCharacter = function(character, thumbnail, emoteThumbnails) {
    project.saveCharacter(character)
    if (thumbnail) {
        fs.ensureDirSync(path.join(project.charactersPath, '..', 'thumbnails'))
        fs.writeFileSync(path.join(project.charactersPath, '..', 'thumbnails', `new-${character.id}.png`), new Buffer(thumbnail, 'base64'))
        if (emoteThumbnails) {
            fs.ensureDirSync(path.join(project.charactersPath, '..', 'thumbnails', `new-${character.id}`))
            let emotes = Object.keys(emoteThumbnails)
            for (let i = 0; i < emotes.length; i++) {
                fs.writeFileSync(path.join(project.charactersPath, '..', 'thumbnails', `new-${character.id}`, `${emotes[i]}.png`), new Buffer(emoteThumbnails[emotes[i]], 'base64'))
            }
        }
        application.updateCharacter(character, true)
    } else {
        application.updateCharacter(character)
    }    
}

exports.connect = function() {
    stage.clearPuppets()
    editor.connect()
    exports.resize()
    if (popout) popout.webContents.send('connect')
}

exports.disconnect = function() {
    stage.clearPuppets()
    editor.disconnect()
    puppet = stage.addPuppet(project.getPuppet(), 1)
    character = JSON.parse(JSON.stringify(project.getPuppet()))
    exports.resize()
    if (popout) popout.webContents.send('disconnect', project.getPuppet())
}

exports.assign = function(id) {
    puppet = stage.addPuppet(project.getPuppet(), id)
    character = JSON.parse(JSON.stringify(project.getPuppet()))
    if (popout) popout.webContents.send('assign puppet', project.getPuppet(), id)
}

exports.addPuppet = function(puppet) {
    stage.addPuppet(puppet, puppet.charId)
    if (popout) popout.webContents.send('add puppet', puppet)
}

exports.removePuppet = function(id) {
    stage.removePuppet(id)
    if (popout) popout.webContents.send('remove puppet', id)
}

exports.getThumbnail = function() {
    if (document.getElementById('screen').style.display == 'none') {
        document.getElementById('screen').style.display = ''
        stage.resize()
        let thumbnail = stage.getThumbnail()
        document.getElementById('screen').style.display = 'none'
        stage.resize()
        return thumbnail
    }
    return stage.getThumbnail()
}

exports.openModal = function(modal) {
    application.toggleModal(modal)
}

exports.getPuppet = function(id) {
    return stage.getPuppet(id)
}

function loadPuppets(stage) {
    status.log('Loading puppets...', 2, 1)

    // Add Puppet
    puppet = stage.addPuppet(project.getPuppet(), 1)
    character = JSON.parse(JSON.stringify(project.getPuppet()))

    // Puppet Editor
    editor.init()
    stage.registerPuppetListener('mousedown', (e) => {
        editor.setPuppet(JSON.parse(project.duplicateCharacter(e.target.puppet)))
        editor.resetChanges()
    })

    // Multiplayer
    network.init()

    // Create Hotbar Puppets
    for (let i = 0; i < project.project.hotbar.length; i++) {
        if (project.project.hotbar[i] !== '' && project.project.hotbar[i] > 0)
            hotbar[i] = stage.createPuppet(project.characters[project.project.hotbar[i]])
    }

    // Update editor
    application.setPuppet(project.project.hotbar.indexOf(project.actor.id), puppet.emotes)
    application.setEmote(puppet.emote)

    // Set view
    application.setView(settings.settings.view || 'hybrid')

    status.log('Project Loaded!', 1, 1)
}

function popIn() {
    popout.close()
}

function popOut() {
    popout = new BrowserWindow({
        x: popoutWindowState.x,
        y: popoutWindowState.y,
        width: popoutWindowState.width,
        height: popoutWindowState.height,
        frame: false, 
        parent: remote.getCurrentWindow(), 
        icon: path.join(__dirname, 'assets', 'icons', 'icon.ico'), 
        backgroundColor: project.project.greenScreen, 
        alwaysOnTop: project.project.alwaysOnTop
    })
    popoutWindowState.manage(popout)
    popout.on('close', () => {
        application.closePopout()
        stage.reattach('screen')
        popout = null
    })
    popout.loadURL(url.format({
        pathname: path.join(__dirname, '../popout.html'),
        protocol: 'file:',
        slashes: true
    }))
    application.openPopout()
}

function applyToAsset(id, callback, savePuppet) {
    let characters = Object.keys(project.characters)
    for (let i = 0; i < characters.length; i++) {
        let character = project.characters[characters[i]]
        let topLevel = ['body', 'head', 'hat', 'props']

        for (let j = 0; j < topLevel.length; j++)
            for (let k = 0; k < character[topLevel[j]].length; k++)
                if (character[topLevel[j]][k].id === id)
                    callback(character[topLevel[j]][k], character[topLevel[j]], k)

        let emotes = Object.keys(character.emotes)
        for (let j = 0; j < emotes.length; j++) {
            for (let k = 0; k < character.emotes[emotes[j]].eyes.length; k++)
                if (character.emotes[emotes[j]].eyes[k].id === id)
                    callback(character.emotes[emotes[j]].eyes[k], character.emotes[emotes[j]].eyes, k)
            for (let k = 0; k < character.emotes[emotes[j]].mouth.length; k++)
                if (character.emotes[emotes[j]].mouth[k].id === id)
                    callback(character.emotes[emotes[j]].mouth[k], character.emotes[emotes[j]].mouth, k)
        }

        if (savePuppet)
            exports.saveCharacter(character)
    }
}
