

const { fetchSBOLObjectRecursive } = require('../fetch/fetch-sbol-object-recursive')
const { getModuleDefinitionMetadata } = require('../query/module-definition')
const { getContainingCollections } = require('../query/local/collection')

var retrieveCitations = require('../citations')

var loadTemplate = require('../loadTemplate')

var sbolmeta = require('./utils/sbolmeta')

var formatSequence = require('sequence-formatter')

var async = require('async')

var prefixify = require('../prefixify')

var pug = require('pug')

var sparql = require('../sparql/sparql-collate')

var getDisplayList = require('visbol/lib/getDisplayList').getDisplayList

var getInteractionList = require('visbol/lib/getInteractionList')

var config = require('../config')

var URI = require('sboljs').URI

var sha1 = require('sha1');

var getUrisFromReq = require('../getUrisFromReq')

const uriToUrl = require('../uriToUrl')

module.exports = function(req, res) {

	var locals = {
        config: config.get(),
        section: 'module',
        user: req.user
    }

    var meta
    var moduleDefinition
    var collectionIcon
    var remote

    var collections = []

    var submissionCitations = []
    var citations = []

    var otherModules = []
    var mappings = {}

    var sbol

    const { graphUri, uri, designId, share, url } = getUrisFromReq(req, res)

    var templateParams = {
        uri: uri
    }

    var getCitationsQuery = loadTemplate('sparql/GetCitations.sparql', templateParams)

    fetchSBOLObjectRecursive('ModuleDefinition', uri, graphUri).then((result) => {

        sbol = result.sbol
        moduleDefinition = result.object
        remote = result.remote

        if(!moduleDefinition || moduleDefinition instanceof URI) {
            locals = {
                config: config.get(),
                section: 'errors',
                user: req.user,
                errors: [ uri + ' Record Not Found' ]
            }
            res.send(pug.renderFile('templates/views/errors/errors.jade', locals))
            return
        }

        meta = sbolmeta.summarizeModuleDefinition(moduleDefinition,req,sbol,remote,graphUri)
        if(!meta) {
            locals = {
                config: config.get(),
                section: 'errors',
                user: req.user,
                errors: [ uri + ' summarizeModuleDefinition returned null' ]
            }
            res.send(pug.renderFile('templates/views/errors/errors.jade', locals))
            return
        }

    }).then(function lookupCollections() {

        return Promise.all([
	    getContainingCollections(uri, graphUri, req.url).then((_collections) => {

		collections = _collections

		collections.forEach((collection) => {

		    collection.url = uriToUrl(collection.uri)

                    const collectionIcons = config.get('collectionIcons')
                    
                    if(collectionIcons[collection.uri])
			collectionIcon = collectionIcons[collection.uri]
		})
            }),

	    sparql.queryJson(getCitationsQuery, graphUri).then((results) => {

                citations = results

            }).then(() => {

                return retrieveCitations(citations).then((resolvedCitations) => {

                    submissionCitations = resolvedCitations;

                    //console.log('got citations ' + JSON.stringify(submissionCitations));

                })

            })

        ])

    }).then(function renderView() {

	locals.rdfType = {
	    name : 'Module',
	    url : 'http://wiki.synbiohub.org/wiki/Terms/SynBioHub#Module'
	}

        locals.meta = meta

	var component = {
	    segments : []
	}

	if (config.get('showModuleInteractions') && moduleDefinition.interactions.length > 0) {
	    //moduleDefinition.functionalComponents.forEach(function(functionalComponent) {   
		//component.segments = component.segments.concat(
		 //   getDisplayList(functionalComponent.definition, config,
		//		   req.url.toString().endsWith('/share')).components[0].segments[0])
	    //})
	    var currentInteractions = getInteractionList(moduleDefinition,config,req.url.toString().endsWith('/share'))
            for (let i in currentInteractions) {

                interactions.push(currentInteractions[i]);

            }
//	    moduleDefinition.modules.forEach(function(module) {
//		interactions = interactions.concat(
//		    getInteractionList(module.definition)
//		)
//	    })

	    locals.meta.displayList = {
		version: 1,
		components: [
            	    component
		],
		interactions: interactions
	    }
	    console.log(JSON.stringify(locals.meta.displayList))
	}


        locals.modules = moduleDefinition.modules
        locals.modules.forEach((module) => {
            if (module.definition.uri) {
                module.defId = module.definition.displayId
                module.defName = module.definition.name
                if (module.definition.uri.toString().startsWith(config.get('databasePrefix'))) {
                    module.url = '/' + module.definition.uri.toString().replace(config.get('databasePrefix'),'')
		    if (module.definition.uri.toString().startsWith(config.get('databasePrefix')+'user/') && req.url.toString().endsWith('/share')) {
			module.url += '/' + sha1('synbiohub_' + sha1(module.definition.uri.toString()) + config.get('shareLinkSalt')) + '/share'
		    }            
                } else {
                    module.url = module.definition.uri.toString()
		}
            } else {
                module.defId = module.definition.toString()
                module.defName = ''
                module.url = module.definition.toString()
            }
        })
        locals.roles = moduleDefinition.roles
        locals.models = moduleDefinition.models
        locals.models.forEach((model) => {
            if (model.uri) {
                if (model.uri.toString().startsWith(config.get('databasePrefix'))) {
                    model.url = '/' + model.uri.toString().replace(config.get('databasePrefix'),'')
		    if (model.uri.toString().startsWith(config.get('databasePrefix')+'user/') && req.url.toString().endsWith('/share')) {
			model.url += '/' + sha1('synbiohub_' + sha1(model.uri.toString()) + config.get('shareLinkSalt')) + '/share'
		    }            
                } else {
                    model.url = model.uri.toString()
                }
                model.version = model.uri.toString().substring(model.uri.toString().lastIndexOf('/')+1)
                var persId = model.uri.toString().substring(0,model.uri.toString().lastIndexOf('/'))
                model.id = persId.substring(persId.lastIndexOf('/')+1)
            } else {
                model.url = model.toString()
                model.id = model.toString()
                model.name = ''
            }
        })
        locals.functionalComponents = moduleDefinition.functionalComponents
        locals.functionalComponents.forEach((functionalComponent) => {
            functionalComponent.link()
            if (functionalComponent.definition.uri) {
                functionalComponent.defId = functionalComponent.definition.displayId
                functionalComponent.defName= functionalComponent.definition.name && functionalComponent.definition.name != '' ? functionalComponent.definition.name : functionalComponent.definition.displayId
                if (functionalComponent.definition.uri.toString().startsWith(config.get('databasePrefix'))) {
                    functionalComponent.url = '/' + functionalComponent.definition.uri.toString().replace(config.get('databasePrefix'),'')
		    if (functionalComponent.definition.uri.toString().startsWith(config.get('databasePrefix')+'user/') && req.url.toString().endsWith('/share')) {
			functionalComponent.url += '/' + sha1('synbiohub_' + sha1(functionalComponent.definition.uri.toString()) + config.get('shareLinkSalt')) + '/share'
		    }  
                } else { 
                    functionalComponent.url = functionalComponent.definition.uri.toString()
		}
            } else {
                functionalComponent.defId = functionalComponent.definition.toString()
                functionalComponent.defName = ''
                functionalComponent.url = functionalComponent.definition.toString()
            }
            functionalComponent.typeStr = functionalComponent.access.toString().replace('http://sbols.org/v2#','') + ' '
                + functionalComponent.direction.toString().replace('http://sbols.org/v2#','').replace('none','')
        })
	locals.interactions = moduleDefinition.interactions
        locals.interactions.forEach((interaction) => {
	    interaction.typeStr = ''
	    interaction.types.forEach((type) => {
                var sboPrefix = 'http://identifiers.org/biomodels.sbo/'
		if(type.toString().indexOf(sboPrefix) === 0) {
		    var sboTerm = type.toString().slice(sboPrefix.length).split('_').join(':')
    		    interaction.typeStr = sbolmeta.systemsBiologyOntology[sboTerm].name
		    interaction.typeURL = type.toString()
		}
	    })
	    interaction.defId = interaction.displayId
	    interaction.defName = interaction.name?interaction.name:interaction.displayId
	    interaction.participations.forEach((participation) => {
		participation.roleStr = ''
		participation.roles.forEach((role) => {
                    var sboPrefix = 'http://identifiers.org/biomodels.sbo/'
		    if(role.toString().indexOf(sboPrefix) === 0) {
			var sboTerm = role.toString().slice(sboPrefix.length).split('_').join(':')
    			participation.roleStr = sbolmeta.systemsBiologyOntology[sboTerm].name
			participation.roleURL = role.toString()
		    }
		})
		// if (participation.participant.definition.uri) {
		//     if (participation.participant.definition.uri.toString().startsWith(config.get('databasePrefix'))) {
		// 	participation.participant.url = '/' + participation.participant.uri.toString().replace(config.get('databasePrefix'),'')
		// 	if (participation.participant.definition.uri.toString().startsWith(config.get('databasePrefix')+'user/') && req.url.toString().endsWith('/share')) {
		// 	    participation.participant.url += '/' + sha1('synbiohub_' + sha1(participation.participant.definition.uri.toString()) + config.get('shareLinkSalt')) + '/share'

		// 	}            
		//     } else { 
		// 	participation.participant.url = participation.participant.definition.uri.toString()
		//     }
                //     participation.participant.defId = participation.participant.definition.displayId
                //     participation.participant.defName = participation.participant.definition.name?participation.participant.definition.name:participation.participant.definition.displayId
		// }else {
                //     participation.participant.defId = participation.participant.displayId
                //     participation.participant.defName = participation.participant.name?participation.participant.name:participation.participant.displayId
                //     participation.participant.url = participation.participant.definition.toString()
		// }
	    })
	})

	locals.share = share
        locals.sbolUrl = url + '/' + moduleDefinition.displayId + '.xml'
        locals.prefix = req.params.prefix
        locals.collectionIcon = collectionIcon

        locals.submissionCitations = submissionCitations
	locals.citationsSource = citations.map(function(citation) {
            return citation.citation
        }).join(',');

        locals.collections = collections

        //locals.meta.displayList = getDisplayList(moduleDefinition)

        res.send(pug.renderFile('templates/views/moduleDefinition.jade', locals))

    }).catch((err) => {

        locals = {
            config: config.get(),
            section: 'errors',
            user: req.user,
            errors: [ err.stack ]
        }
        res.send(pug.renderFile('templates/views/errors/errors.jade', locals))
    })
	
};

function listNamespaces(xmlAttribs) {

    var namespaces = [];

    Object.keys(xmlAttribs).forEach(function(attrib) {

        var tokens = attrib.split(':');

        if(tokens[0] === 'xmlns') {

            namespaces.push({
                prefix: tokens[1],
                uri: xmlAttribs[attrib]
            })
        }
    });

    return namespaces;
}

