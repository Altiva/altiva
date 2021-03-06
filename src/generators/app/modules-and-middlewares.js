import { EOL } 			from 'os';
import fs 				from 'fs-extra';
import hjson			from 'hjson';

// Alumna modules - utils
import fileExists 	from './../../utils/fileExists.js';
import isObject 	from './../../utils/isObject.js';
import to			from './../../utils/to.js';

let base_dir    = __dirname;
let modules_dir = './modules/';
let middlewares_dir = './middlewares/';

const modules_and_middlewares = async function ( options, app ) {

	let err, modules_codes = '', middleware_codes = '', browser_code = await fs.readFile( base_dir + '/browser.js', 'utf8' );

	/* MODULES */
	[ err, modules_codes ] = await to( modules( options ) )

	if ( err ) return Promise.reject( err );
	

	/* MIDDLEWARES */
	[ err, middleware_codes ] = await to( middlewares( options, app ) )

	if ( err ) return Promise.reject( err );


	return browser_code + modules_codes + middleware_codes;

};

const modules = async function ( options ) {

	let err, modules_codes = [];

	/* MODULES */

	// Check if the "modules" property is defined in options ( alumna.hjson )
	if ( !options.modules ) return ''; 

	// and it is an object
	if ( !isObject( options.modules ) ) return Promise.reject( { message: 'Error in "app.js": The app.modules property is not an object.' } );

	let modules_sarray = Object.keys( options.modules );
	
	// If there aren't modules, don't bundle the codes
	if ( !modules_sarray.length ) return ''; 

	// Otherwise, do it
	[ err, modules_codes ] = await to( Promise.all( modules_sarray.map( module ) ) );

	return err ? Promise.reject( err ) : merge_modules( modules_codes );

};

const module = async function ( module_name ) {

	// Check the existence of module directory
	if ( ! await fileExists( modules_dir + module_name ) )
		return Promise.reject( { message: 'Missing "' + module_name + '" module. Please install it with: alumna install' } );

	// Check the existence of module.hjson or package.json and get its properties
	let properties 	= null;
	let is_hjson 	= false;

	if ( await fileExists( modules_dir + module_name + '/module.hjson' ) ) {
		
		properties = hjson.parse( await fs.readFile( modules_dir + module_name + '/module.hjson', 'utf8' ) );

		is_hjson = true;
	}

	else if ( await fileExists( modules_dir + module_name + '/package.json' ) )
		properties = JSON.parse( await fs.readFile( modules_dir + module_name + '/package.json', 'utf8' ) );

	else
		return Promise.reject( { message: 'Missing module.hjson or package.json in "' + module_name + '" module\'s directory.' } )

	let [ err ] = await to( validate_module( properties.main, module_name, is_hjson ) );

	if ( err )
		return Promise.reject( err );

	let module_and_file = {};

	module_and_file[ module_name ] = await fs.readFile( modules_dir + module_name + '/' + properties.main, 'utf8' );

	return module_and_file;
};

const validate_module = async function( mainfile, module_name, is_hjson ) {

	let json = is_hjson ? 'module.hjson' : 'package.json';

	if ( !( mainfile && typeof mainfile === 'string' && mainfile.length ) )
		return Promise.reject( { message: 'Missing or wrong "main" property in "' + module_name + '/' + json + '" file.' } );

	if ( !await fileExists( modules_dir + module_name + '/' + mainfile ) )
		return Promise.reject( { message: 'The main "' + mainfile + '" file defined in module "' + module_name + '" doesn\'t exist.' } );

	return true;
		

};


const merge_modules = function ( module_codes ) {

	let code = EOL + EOL + 'Alumna.modules = {};' + EOL;

	module_codes.forEach( single => Object.keys( single ).map( single_name => code += EOL + 'Alumna.modules[ \'' + single_name + '\' ] = ' + single[ single_name ] + EOL ) );

	code += EOL + 'Alumna.module = Alumna.modules;' + EOL;

	return code + EOL;

};

const middlewares = async function ( options, app ) {

	// Check if there are used middlewares
	if ( !isObject( app.used_middlewares, true ) ) return '';

	let middleware_codes  = EOL + EOL + 'Alumna.middlewares = {};' + EOL + EOL + 'Alumna.middleware = Alumna.middlewares;' + EOL + EOL;

	for ( const middleware in app.used_middlewares ) {

		// Check if the used middleware is properly defined in "alumna.hjson"
		if ( !options.middlewares[ middleware ] )
			return Promise.reject( { message: 'Error in "app.js": The middleware "' + middleware + '" isn\'t defined in "alumna.hjson".' } );
			
		// Get and adjust the path properly
		let path = middleware_path( options.middlewares[ middleware ] );

		// And check if the informed file exists
		if ( !await fs.pathExists( path ) )
			return Promise.reject( { message: 'Error in "app.js": The file of middleware "' + middleware + '" doesn\'t exist.' } );
		
		middleware_codes += await fs.readFile( path, 'utf8' ) + EOL + EOL;

	}

	// Here, all middlewares were successfully imported
	// We will, then, add to the browser code the relation of routes and its middlewares,
	// so the runtime code will have all the information to correctly apply those middlewares.

	middleware_codes += 'Alumna.middleware_in_routes = ' + JSON.stringify( app.middlewares ) + ';'

	return middleware_codes;

};

const middleware_path = function ( path ) {

	if ( path.startsWith( '/' ) ) path = path.substring( 1 );

	if ( !path.endsWith( '.js' ) ) path += '.js';

	return middlewares_dir + path;

}

export default modules_and_middlewares;