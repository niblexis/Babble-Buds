import React, {Component} from 'react'
import { connect } from 'react-redux'
import FlexLayout from 'flexlayout-react'
import Assets from './../assets/Assets'
import Stage from './../stage/Stage'
import Console from './Console'
import Puppets from '../puppets/Puppets'
import Controller from '../controller/Controller'
import ProjectSettings from './../settings/ProjectSettings'
import Inspector from './../inspector/Inspector'
import Editor from './../editor/Editor'
import Layers from './../layers/Layers'
import './flexlayout-dark.css'
import './panels.css'

import defaultLayout from './../../data/default-layout.json'

const electron = window.require('electron')

class Panels extends Component {
    constructor(props) {
        super(props)

        this.layout = React.createRef()

        this.state = {
            model: FlexLayout.Model.fromJson(props.layout)
        }

        this.updateConfig = this.updateConfig.bind(this)
        this.onAction = this.onAction.bind(this)
        this.onModelChange = this.onModelChange.bind(this)
        this.loadLayout = this.loadLayout.bind(this)
        this.togglePanel = this.togglePanel.bind(this)
    }

    factory(node) {
        const component = node.getComponent()
        const {grid, highlight} = node.getConfig() ? node.getConfig() : {}

        switch(component) {
        case 'text':
            return <div className="panel">{node.getName()}</div>
        case 'stage':
            this.stage = node._parent.getId()
            return <Stage
                ref={this.props.stage}
                addJiggleListener={this.props.addJiggleListener}
                removeJiggleListener={this.props.removeJiggleListener}
                rect={node._rect} />
        case 'inspector':
            return <Inspector/>
        case 'console':
            return <Console/>
        case 'puppets':
            return <Puppets size={node.getConfig().size} onZoomChange={this.updateConfig(node, 'size')} />
        case 'project-settings':
            return <ProjectSettings/>
        case 'assets':
            return <Assets size={node.getConfig().size} onZoomChange={this.updateConfig(node, 'size')} />
        case 'controller':
            return <Controller/>
        case 'editor':
            return <Editor rect={node._rect} grid={grid} highlight={highlight} onZoomChange={this.updateConfig(node, 'grid')} onHighlightChange={this.updateConfig(node, 'highlight')} />
        case 'layers':
            return <Layers/>
        default:
            break
        }
    }

    updateConfig(node, field) {
        return value => {
            node.getConfig()[field] = value
            this.props.dispatch({
                type: 'UPDATE_LAYOUT',
                layout: this.state.model.toJson()
            })
        }
    }

    onAction(action) {
        // This is just temporary until we allow the stage to be off-screen
        if (!(action.type === 'FlexLayout_SetActiveTabset' && action.tabsetNode === this.stage)) {
            this.state.model.doAction(action)
        }
    }

    onModelChange(model) {
        this.props.dispatch({
            type: 'UPDATE_LAYOUT',
            layout: model.toJson()
        })
    }

    componentDidMount() {
        electron.ipcRenderer.on('load layout', this.loadLayout)
        electron.ipcRenderer.on('toggle panel', this.togglePanel)
    }

    componentWillUnmount() {
        electron.ipcRenderer.removeListener('load layout', this.loadLayout)
        electron.ipcRenderer.removeListener('toggle panel', this.togglePanel)
    }

    componentWillReceiveProps(props) {
        this.setState({
            model: FlexLayout.Model.fromJson(props.layout)
        })
    }

    loadLayout(e, layout) {
        switch (layout) {
        case 'default':
            this.props.dispatch({ type: 'LOAD_LAYOUT', layout: defaultLayout })
            break
        default:
            break
        }
    }

    togglePanel(e, panel) {
        const tab = {
            component: panel,
            name: panel.replace(/-/g, ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        }
        if (panel === 'puppets' || panel === 'assets') {
            tab.config = {
                'size': 120
            }
        } else if (panel === 'editor') {
            tab.config = {
                'grid': 2
            }
        }
        this.layout.current.addTabToActiveTabSet(tab)
    }

    render() {
        return (
            <div className="flexlayout-container">
                <FlexLayout.Layout
                    ref={this.layout}
                    model={this.state.model}
                    factory={this.factory.bind(this)}
                    onAction={this.onAction}
                    onModelChange={this.onModelChange} />
            </div>
        )
    }
}

function mapStateToProps(state) {
    return {
        layout: state.settings.layout,
        layoutUpdate: state.settings.layoutUpdate
    }
}

export default connect(mapStateToProps)(Panels)