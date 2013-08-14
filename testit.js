(function(scope) {

var rootTimeDone = false;

var testit = function() {
    /**
     * group class, which will contain tests
     * In addition, it will be used for wrapping some wrong code from falling.
     * @constructor
     * @private
     * @attribute {String} type         type of object ('group' or 'test')
     * @attribute {String} name         name of group
     * @attribute {String} status       indicate results of all test in group ('pass','fail','error')
     * @attribute {String} comment      text specified by user
     * @attribute {Error}  error        contain error object if some of tests throw it
     * @attribute {Number} time         time in ms spend on code in group
     * @attribute {Object} result       counters for tests and groups
     * @attribute {array}  stack        array of tests and groups
     */
    var group = function() {
        this.type = 'group';
        this.name = undefined;
        this.status = undefined;
        this.comment = undefined;
        this.error = undefined;
        this.time = 0;
        this.result = {
            pass: 0,
            fail: 0,
            error: 0,
            total: 0
        };
        this.stack = [];
    }

    /**
     * test class, which will contain result and some more info about one test
     * @constructor
     * @private
     * @attribute {String} type         type of object ('group' or 'test')
     * @attribute {String} status       indicate results of test ('pass','fail','error')
     * @attribute {String} comment      text specified by user
     * @attribute {String} description  text generated by script
     * @attribute {Error}  error        contain error object if test can throw it without falling
     * @attribute {Number} time         time in ms spend on test
     * @attribute {Array}  argument     all received arguments
     */
    var test = function() {
        this.type = 'test';
        this.status = undefined;
        this.comment = undefined;
        this.description = undefined;
        this.error = undefined;
        // this.time = new Date().getTime();
        this.argument = [];
    }

    /**
     * main group
     * @public
     * @type {group}
     */
    var root = new group();
    this.root = root;
    root.name = 'root';
    root.time = new Date().getTime();

    /**
     * make new instace of group, fill it, add it into previous group.stack, fill some values in previous group
     * It will be called thrue _makeGroup.call(); this - current level group (can be root)
     * @private
     * @chainable
     * @param  {String}   name          name of new group
     * @param  {Function} fun           function witch will be tryed to execute (commonly consist of tests and other groups)
     * @return {Object}                     test with link
     */
    var _makeGroup = function(name,fun) {
        /** get timestamp */
        var time = new Date().getTime();
        
        /** var for the new instance of group */
        var newgroup;
        /** identify new group */
        var groupAlreadyExist = false;
        /** find group in current-level stack */
        for (var i in this.stack) {
            if (this.stack[i].type !== 'group') continue;
            if (this.stack[i].name === name) {
                newgroup = this.stack[i];
                groupAlreadyExist = true;
                break;
            }
        }
        if (!groupAlreadyExist) newgroup = new group();
        newgroup.name = name;

        /** add backlink to provide trek back */
        newgroup.linkBack = this;

        /** set to pass as default. it's may be changed in some next lines */
        var oldstatus;
        if (groupAlreadyExist) oldstatus = newgroup.status;
        newgroup.status ='pass';

        /**
         * try to execute code with tests and other groups in it
         * This part provide nesting.
         * for this reason there are redefinition of root
         */
        try {
            var oldRoot = root;
            root = newgroup;
            fun();
            root = oldRoot;
        } catch(e) {
            newgroup.status = 'error';
            newgroup.error = generateError(e);
        }

        /** update time */
        newgroup.time += new Date().getTime() - time;

        /** finally place this group into previous level stack (if it's a new group) */
        if (!groupAlreadyExist) this.stack.push(newgroup);

        /** update counters */
        updateCounters(newgroup);

        /** return testit with link to this group to provide chaining */
        return newgroup;
    }
    /**
     * return group by it's name in current level group stack
     * It will be called thrue _getGroup.call(); this - current level group (can be root)
     * @private
     * @param  {String} name    name of group which will be searched for
     * @return {Object}         group
     */
    var _getGroup = function (name) {
        var stack = this.stack;
        for (var i in stack) {
            if (stack[i].type !== 'group') continue;
            if (stack[i].name === name) {
                return stack[i];
            }
        }
        throw new ReferenceError('there are no group with name: '+name);
    }
    /**
     * Define wich group() method must be called.
     * Produce chaining
     * @private
     * @chainable chain-opener
     * @param  {String}   name      name of group
     * @param  {Function} fun       function contains tests and other groups
     * @return {Object}             testit object with link to specified group (produce chaining)
     */
    var _group = function(name,fun) {
        /**
         * There may be 3 situation:
         *     this.link is root && root is root                - test.group() called in root scope
         *     this.link is root && root is some group          - test.group() called in some other group scope
         *     this.link is some group && root is root          - .group() called in chain
         *     this.link is some group && root is some group    - .group() called in chain in some other group scope
         * look at it with:
         *     console.log(name,'\nlink: ',this.link,'\nroot: ',root);
         */
        var currentLevel = (this.link.name!=='root')?this.link:root;
        var linkToGroup;

        switch (arguments.length) {
            case 0 : throw new RangeError("test.group expect at least 1 argument");
            case 1 : {
                    linkToGroup = _getGroup.call(currentLevel,name);
                } break;
            case 2 : {
                    linkToGroup = _makeGroup.call(currentLevel,name,fun);
                } break;
            default : throw new RangeError("test.group expect maximum of 2 arguments");
        }

        /** get trace for this group */
        var trace = getTrace();

        return Object.create(this,{link:{value:linkToGroup},trace:{value:trace}});
    }
    /**
     * public interface for _makeGroup
     * @public
     * @example
     *  test.group('name of group',function(){
     *      test.it('nested test');
     *      test.group('nested group',function(){
     *          test.it('deep nested test');
     *      });
     *  });
     */
    this.group = _group;

    /**
     * Base for all tests. Make new instance of test, fill it through test-functions, add it to previous group.stack
     * @private
     * @chainable chain-opener
     * @param {String} type   determinate wich test-function will be used
     * @param {Array} args    arguments array
     * @return {Object}       test with link
     */
    var _doTest = function (type,args) {
        /**
         * making a new instance of test
         * Most of code in this function will manipulate whis it.
         */
        var newtest = new test();

        /** fill test.agrument from method arguments */
        for (var i in args) {
            newtest.argument.push(args[i]);
        }
        switch (type) {
            case 'it' : _testIt(newtest); break;
            case 'them' : _testThem(newtest); break;
            case 'type' : _testType(newtest); break;
            case 'types' : _testTypes(newtest); break;
        }
        
        /** calculate time, if .time was called before this test */
        if (this.timestamp) newtest.time = new Date().getTime() - this.timestamp;

        /** finally place this test into container stack */
        root.stack.push(newtest);

        /** update counters of contained object */
        updateCounters(root);

        /** get trace for this test */
        var trace = getTrace();

        /** return testit with
         *      link to this test to provide chaining
         *      time in ms spended on test
         *      trace for this test
         */
        return Object.create(this,{link:{value:newtest},trace:{value:trace}});
    }
    this.it = function(){return _doTest.call(this,'it',arguments)};
    this.them = function(){return _doTest.call(this,'them',arguments)};
    this.type = function(){return _doTest.call(this,'type',arguments)};
    this.types = function(){return _doTest.call(this,'types',arguments)};

    /**
     * test value to be true-like
     * @private
     * @param {Object}  testobj     test object, wich will be filled with result
     */
    var _testIt = function(testobj){
        switch (testobj.argument.length) {
            /** in case of no arguments - throw Reference error */
            case 0 : {
                testobj.status = 'error';
                testobj.error = generateError(new RangeError("at least one argument expected"));
            } break;
            /** if there only one argument - test it for truth */
            case 1 : {
                if (testobj.argument[0]) {
                    testobj.description = 'argument is true-like';
                    testobj.status = 'pass';
                } else {
                    testobj.description = 'argument is false-like';
                    testobj.status = 'fail';
                }
            } break;
            /** if there are two arguments - test equalence between them */
            case 2 : {
                if (_typeof(testobj.argument[0]) !== _typeof(testobj.argument[1])) {
                    testobj.description = 'argument hase different types';
                    testobj.status = 'fail';
                } else if (deepCompare(testobj.argument[0],testobj.argument[1])) {
                    testobj.description = 'arguments are equal';
                    testobj.status = 'pass';
                } else {
                    testobj.description = 'argument are not equal';
                    testobj.status = 'fail';
                }
            } break;
            /** otherwise throw Range error */
            default : {
                testobj.status = 'error';
                testobj.error = generateError(new RangeError("maximum of 2 arguments expected"));
            }
        }
    }

    /**
     * Test array of values to be true-like
     * @private
     * @param  {Object} testobj     test object, wich will be filled with result
     */
    var _testThem = function(testobj){
        switch (testobj.argument.length) {
            /** in case of no arguments - throw Reference error */
            case 0 : {
                testobj.status = 'error';
                testobj.error = generateError(new RangeError("at least one argument expected"));
            } break;
            /** if there only one argument - do staff */
            case 1 : {
                /** if first argument is not an Array - throw TypeError */
                if (_typeof(testobj.argument[0]) !== 'Array') {
                    testobj.status = 'error';
                    testobj.error = generateError(new TypeError("argument must be an array"));
                } else {
                    /** test elements of array to be true-like */
                    for (var i in testobj.argument[0]) {
                        if (!testobj.argument[0][i]) {
                            testobj.status = 'fail';
                            testobj.description = 'there are at least one false-like element';
                        }
                    }
                    /** test passed if there are no false-like elements found */
                    if (testobj.status !== 'fail') {
                        testobj.status = 'pass';
                        testobj.description = 'arguments are true-like';
                    }
                }
            } break;
            /** otherwise throw Range error */
            default : {
                testobj.status = 'error';
                testobj.error = generateError(new RangeError("maximum of 1 arguments expected"));
            }
        }
    }

    /**
     * test type of value to be equal to specified
     * @private
     * @param  {Object} testobj     test object, wich will be filled with result
     */
    var _testType = function(testobj) {
        if (testobj.argument.length!==2) {
            testobj.status = 'error';
            testobj.error = generateError(new RangeError("expect two arguments"));
        } else if (_typeof(testobj.argument[1]) !== 'String') {
            testobj.status = 'error';
            testobj.error = generateError(new TypeError("second argument must be a String"));
        } else if (!arrayConsist(identifiedTypes,testobj.argument[1].toLowerCase())) {
            testobj.status = 'error';
            testobj.error = generateError(new TypeError("second argument must be a standart type"));
        } else {
            testobj.description = 'type of argument is ';
            if (_typeof(testobj.argument[0]).toLowerCase() !== testobj.argument[1].toLowerCase()) {
                testobj.description += 'not '+testobj.argument[1];
                testobj.status = 'fail';
            } else {
                testobj.description += _typeof(testobj.argument[0]);
                testobj.status = 'pass';
            }
        }
    }

    /**
     * test type of elements in array to be equal to specified or/and between each other
     * @private
     * @param  {Object} testobj     test object, wich will be filled with result
     */
    var _testTypes = function(testobj) {
        if (testobj.argument.length==0) {
            testobj.status = 'error';
            testobj.error = generateError(new RangeError("at least one argument expected"));
        } else if (testobj.argument.length>2) {
            testobj.status = 'error';
            testobj.error = generateError(new RangeError("maximum of two arguments expected"));
        } else if (_typeof(testobj.argument[0]) !== 'Array') {
            testobj.status = 'error';
            testobj.error = generateError(new TypeError("first argument must be an array"));
        } else {
            var type, types;
            if (_typeof(testobj.argument[1]) === 'undefined') {
                type = _typeof(testobj.argument[0][0]);
                types = 'same';
            } else if (_typeof(testobj.argument[1]) !== 'String') {
                testobj.status = 'error';
                testobj.error = generateError(new TypeError("second argument must be a String"));
             } else if (!arrayConsist(identifiedTypes,testobj.argument[1].toLowerCase())) {
                testobj.status = 'error';
                testobj.error = generateError(new TypeError("second argument must be a standart type"));
            } else {
                type = testobj.argument[1];
                types = 'right';
            }
            if (testobj.status !== 'error') {
                type = type.toLowerCase();
                for (var i in testobj.argument[0]) {
                    if (_typeof(testobj.argument[0][i]).toLowerCase() !== type) {
                        testobj.status = 'fail';
                        testobj.description = 'There are at least one element with different type';
                    }
                }
                if (testobj.status !== 'fail') {
                    testobj.status = 'pass';
                    testobj.description = 'arguments are '+types+' type';
                }
            }
        }
    }

    /**
     * add spended time to result of test
     * @private
     * @chainable chain-opener
     * @type {Object}
     */
    var _time = Object.create(this,{timestamp:{value:new Date().getTime()}});
    /**
     * public interface for _time
     * @public
     * @example
     *   test.time.it(someThing());
     */
    this.time = _time;

    /**
     * add comment for the linked test or group
     * @private
     * @chainable chain-link
     * @type {Function}
     * @param  {String} text        user defined text, which will be used as a comment
     */
    var _comment = function(text) {
        /** add comment, if there are something can be commented */
        if (!this.link) throw new ReferenceError('comment can only be used in testit chain');
        this.link.comment = text;

        return this;
    }
    /**
     * public interface for _comment()
     * @public
     * @example
     *   test.group('group name',function(){
     *      test
     *          .it(someThing)
     *          .comment('comment to test');
     *   }).comment('comment to group');
     */
    this.comment = _comment;

    /**
     * try to execute functions in arguments, depend on test|group result
     * @private
     * @chainable chain-link
     * @param  {Function} pass  function to execute if test|group passed
     * @param  {Function} fail  function to execute if test|group failed
     * @param  {Function} error function to execute if test|group cause error
     */
    var _callback = function(pass,fail,error) {
        if (!this.link) throw new ReferenceError('callback can only be used in testit chain');
        if (this.link.status === 'pass' && _typeof(pass) === 'Function' ) try {pass();} catch(e) {throw e;}
        if (this.link.status === 'fail' && _typeof(fail) === 'Function' ) try {fail();} catch(e) {throw e;}
        if (this.link.status === 'error' && _typeof(error) === 'Function' ) try {error();} catch(e) {throw e;}

        return this;
    }
    /**
     * public interface for _callback()
     * @public
     * @example
     *   test.it(someThing).callback(
     *       function() {...} // - will be execute if test passed
     *      ,function() {...} // - will be execute if test failed
     *      ,function() {...} // - will be execute if test error
     *   );
     */
    this.callback = _callback;

    /**
     * add trace to test/group
     * @private
     * @chainable chain-link
     * @param  {Number} level       Number of trace lines which will be added
     */
    var _addTrace = function(level) {
        if (!this.link) throw new ReferenceError('addTrace can only be used in testit chain');
        if (this.trace) {
            var trace = this.trace
            if (_typeof(level) === 'Number') trace = trace.split('\n').slice(0,level+1).join('\n');
            this.link.trace = trace;
        }

        return this;
    }
    /**
     * public interface for _addTrace()
     * @public
     * @example
     *   test.it(someThing).addTrace(); // add full trace
     *   test.it(someThing).addTrace(0); // add only first line of trace
     */
    this.addTrace = _addTrace;

    /**
     * Final chain-link: will return result of test or group
     * @private
     * @return {boolean}            true - if test or group passed, false - otherwise.
     */
    var _result = function() {
        if (this.link) {
            return (this.link.status == 'pass')? true : false;
        }
        return undefined;
    }
    /**
     * public interface for _result()
     * @public
     * @example
     *   var testResult = test.it(undefined).comment('comment to test').result(); // testResult === false
     */
    this.result = _result;

    /**
     * Final chain-link: will return arguments of test (not of group!)
     * @private
     * @return                      single argument or array of arguments
     */
    var _arguments = function() {
        if (this.link) {
            if (this.link.type!=='test') return TypeError('groups does not return arguments');
            switch (this.link.argument.length) {
                case 0 : return undefined
                case 1 : return this.link.argument[0];
                default : return this.link.argument;
            }
        }
        return undefined;
    }
    /**
     * public interface for _arguments()
     * @public
     * @example
     *   var testArguments = test.it('single').comment('comment to test').arguments(); // testArguments === 'single'
     *   testArguments = test.it('first','second').comment('comment to test').arguments(); // testArguments === ['first','second']
     */
    this.arguments = _arguments;


    /** 
     * apply last stuff and display results
     * type {Function}
     * @private
     */
    var _done = function() {
        /** update time in root */
        if (!rootTimeDone) root.time = new Date().getTime() - root.time;
        rootTimeDone = true;

        /** made _done() chain-closer */
        var currentLevel = (this.link.type==='group')?this.link:root;

        /** display root */
        _printConsole(currentLevel);
    }
    /**
     * public interface for _done()
     * @type {Function}
     * @public
     * @example
     *   test.it(1);
     *   test.it(2);
     *   test.it(3);
     *   
     *   test.done();
     */
    this.done = _done;


    /** update counters of contained object */
    var updateCounters = function(link) {
        link.result = {
            pass: 0,
            fail: 0,
            error: 0,
            total: 0
        };
        for (var i in link.stack) {
            link.result.total++;
            switch (link.stack[i].status) {
                case 'pass' : {
                    link.result.pass++;
                } break;
                case 'fail' : {
                    link.result.fail++;
                } break;
                case 'error' : {
                    link.result.error++;
                } break;
            };
        };
        
        if (link.result.error || link.error) {link.status='error'}
        else if (link.result.fail) {link.status='fail'}
        else {link.status='pass'}

        if (link.linkBack) {
            updateCounters(link.linkBack);
        }
    }


    /**
     * pritty display group or test in browser dev console
     * @private
     * @param  {Object} obj     group or test to display
     */
    var _printConsole = function(obj) {

        /** colors for console.log %c */
        var green = "color: green",
            red = "color: red;",
            orange = "color: orange",
            blue = "color: blue",
            normal = "color: normal; font-weight:normal;";

        /** Try to figure out what type of object display and open group */
        switch (obj.type) {
            case 'group' : {
                /** some difference depends on status */
                switch (obj.status) {
                    /** if object passed - make collapsed group*/
                    case 'pass' : {
                        console.groupCollapsed("%s - %c%s%c - %c%d%c/%c%d%c/%c%d%c (%c%d%c ms) %s"
                                     ,obj.name,green,obj.status,normal
                                     ,green,obj.result.pass,normal
                                     ,red,obj.result.fail,normal
                                     ,orange,obj.result.error,normal
                                     ,blue,obj.time,normal,((obj.comment)?obj.comment:''));
                    } break;
                    case 'fail' : {
                        console.group("%s - %c%s%c - %c%d%c/%c%d%c/%c%d%c (%c%d%c ms) %s"
                                     ,obj.name,red,obj.status,normal
                                     ,green,obj.result.pass,normal
                                     ,red,obj.result.fail,normal
                                     ,orange,obj.result.error,normal
                                     ,blue,obj.time,normal,((obj.comment)?obj.comment:''));
                    } break;
                    case 'error' : {
                        console.group("%s - %c%s%c - %c%d%c/%c%d%c/%c%d%c (%c%d%c ms) %s"
                                     ,obj.name,orange,obj.status,normal
                                     ,green,obj.result.pass,normal
                                     ,red,obj.result.fail,normal
                                     ,orange,obj.result.error,normal
                                     ,blue,obj.time,normal,((obj.comment)?obj.comment:''));
                    } break;
                    /** if status is not defined - display error; finish displaying */
                    default : {
                        console.error("No status in object %s",obj.name);
                        return false;
                    }
                }

                /** display description if defined */
                if (obj.description) {
                    console.log(obj.description);
                }

                /** display trace if defined */
                if (obj.trace) {
                    console.log(obj.trace);
                }
                
                /**
                 * display all tests and groups in stack
                 * It will make new levels of group, if there are groups in stack.
                 */
                for (var i in obj.stack) {
                    _printConsole(obj.stack[i]);
                }

                /** display error if defined */
                if (obj.error) {
                    // console.error(obj.error);
                    console.group('%c%s%c: %s',orange,obj.error.type,normal,obj.error.message);
                        if (obj.error.stack) console.log(obj.error.stack);
                        console.dir(obj.error.error);
                    console.groupEnd();
                }

                /** close opened group (current level) */
                console.groupEnd();

            } break;
            case 'test' : {
                /** display different results, depend on status */
                switch (obj.status) {
                    case 'pass' : {
                        /** if pass - collaps group*/
                        console.groupCollapsed("%cpass%c: %s%s%c%s%c%s",green,normal
                                              ,(obj.comment)?obj.comment:''
                                              ,(obj.time)?' (':''
                                              ,(obj.time)?blue:''
                                              ,(obj.time)?obj.time:''
                                              ,(obj.time)?normal:''
                                              ,(obj.time)?' ms)':'');
                    } break;
                    case 'fail' : {
                        console.group("%cfail%c: %s",red,normal
                                              ,(obj.comment)?obj.comment:''
                                              ,(obj.time)?' (':''
                                              ,(obj.time)?blue:''
                                              ,(obj.time)?obj.time:''
                                              ,(obj.time)?normal:''
                                              ,(obj.time)?' ms)':'');
                    } break;
                    case 'error' : {
                        console.group("%cerror%c: %s",orange,normal
                                              ,(obj.comment)?obj.comment:''
                                              ,(obj.time)?' (':''
                                              ,(obj.time)?blue:''
                                              ,(obj.time)?obj.time:''
                                              ,(obj.time)?normal:''
                                              ,(obj.time)?' ms)':'');
                    } break;
                }

                /** display description if defined */
                if (obj.description) console.log(obj.description);
                
                /** display trace if defined */
                if (obj.trace) {
                    console.log(obj.trace);
                }

                /** display error if defined */
                if (obj.error) {
                    // console.error(obj.error);
                    console.group('%c%s%c: %s',orange,obj.error.type,normal,obj.error.message);
                        if (obj.error.stack) console.log(obj.error.stack);
                        console.dir(obj.error.error);
                    console.groupEnd();
                }
                console.log(obj.argument);
                console.groupEnd();
            } break;
        }
    }
    /**
     * public interface for _printConsole
     * @type {Function}
     * @public
     * @example
     *   test.ptint(test.root);
     */
    this.print = _printConsole;

    /**
     * determinate type of argument
     * More powerfull then typeof().
     * @private
     * @return {String}     type name of argument
     *                      undefined, if type was not determinated
     */
    var _typeof = function (argument) {
        var type;
        try {
            switch (argument.constructor) {
                case Array : type='Array';break;
                case Boolean : type='Boolean';break;
                case Date : type='Date';break;
                case Error : type='Error';break;
                case EvalError : type='EvalError';break;
                case Function : type='Function';break;
                // case Math : type='math';break;
                case Number : {type=(isNaN(argument))?'NaN':'Number';}break;
                case Object : type='Object';break;
                case RangeError : type='RangeError';break;
                case ReferenceError : type='ReferenceError';break;
                case RegExp : type='RegExp';break;
                case String : type='String';break;
                case SyntaxError : type='SyntaxError';break;
                case TypeError : type='TypeError';break;
                case URIError : type='URIError';break;
                case Window : type='Window';break;
                case HTMLDocument : type='HTML';break;
                case NodeList : type='NodeList';break;
                default : {
                    if (typeof argument === 'object'
                     && argument.toString().indexOf('HTML') !== -1) {
                        type = 'HTML';
                    } else {
                        type = undefined;
                    }
                }
            }
        } catch (e) {
            type = (argument === null)? 'null' : typeof argument;
        }
        return type;
    }
    /**
     * public interface for _typeof
     * @public
     * @example
     *   test.typeof(myVar);
     */
    this.typeof = _typeof;
    /** list of type, which _typeof can identify */
    var identifiedTypes = ['array', 'boolean', 'date', 'error', 'evalerror', 'function', 'html', 'nan', 'nodelist', 'null', 'number', 'object', 'rangeerror', 'referenceerror', 'regexp', 'string', 'syntaxerror', 'typeerror', 'urierror', 'window'];
    
    /**
     * public interface for getTrace(error)
     * @public
     * @example
     *   test.trace();
     */
    this.trace = getTrace;

    // return this;
    return Object.create(this,{link:{value:root}});
}  

/**
 * figure out what status will be used
 * Depends on significanse:
 * More significant -> less significant.
 * error -> fail -> pass -> undefined
 * @param  {String} oldstatus   first compared status
 * @param  {String} newstatus   second compared status
 * @return {String}             status which will be set
 */
function updateStatus(oldstatus,newstatus) {
    if (oldstatus===undefined) return newstatus;
    if (newstatus===undefined) return oldstatus;
    if (oldstatus==='error' || newstatus==='error') return 'error';
    if (oldstatus==='fail' || newstatus==='fail') return 'fail';
    return 'pass';
}

/**
 * makes and returns more understandable error object
 * @param {Error} error         basic error
 * @return {Object}             new understandable error object
 */
function generateError(error) {
    /**
     * understandable error object
     * @property {Error} error      consist basic error
     * @property {String} type      type of error
     * @property {String} message   message from basic property
     * @property {String} stack     some kind of result of trace()
     */
    var object = {
        error: error,
        type: test.typeof(error),
        message: error.message,
    }
    if (getTrace(error)) object.stack = getTrace(error);

    return object;
}

/**
 * returns a list of functions that have been performed to call the current line
 * @param  {Error} error    if setted, trace will be based on it stack
 * @return {String}         list of functions joined by "\n";
 *                          undefined if error.stack is not supported.
 */
function getTrace(error) {
    if (!error) error = new Error();
    if (!error.stack) return;

    var stack = '';
    error.stack.split(/[\n]/).forEach(function(i,n){
        var addToStack = true;
        /** take off empty strings (FireBug) */
        if (i==='') addToStack = false;
        /** take off Errors (Chrome) */
        if (i.indexOf(test.typeof(error))!==-1) addToStack = false;
        /** take of reference to this function */
        if (i.indexOf('getTrace')!==-1) addToStack = false;
        /** take off any references to testit lines */
        if (i.indexOf('/testit.')!==-1) addToStack = false;
        /** fill the stack */
        if (addToStack) {
            stack += (stack)?'\n':'';
            stack += i.replace(/((\s+at\s+)|(^@))/,'');
        }
    })
    return stack;
}

/**
 * Compare any type of variables
 * @return {Boolean}            result of comparison
 * {@link http://stackoverflow.com/a/1144249/1771942}
 */
function deepCompare(){function c(d,e){var f;if(isNaN(d)&&isNaN(e)&&"number"==typeof d&&"number"==typeof e)return!0;if(d===e)return!0;if("function"==typeof d&&"function"==typeof e||d instanceof Date&&e instanceof Date||d instanceof RegExp&&e instanceof RegExp||d instanceof String&&e instanceof String||d instanceof Number&&e instanceof Number)return d.toString()===e.toString();if(!(d instanceof Object&&e instanceof Object))return!1;if(d.isPrototypeOf(e)||e.isPrototypeOf(d))return!1;if(d.constructor!==e.constructor)return!1;if(d.prototype!==e.prototype)return!1;if(a.indexOf(d)>-1||b.indexOf(e)>-1)return!1;for(f in e){if(e.hasOwnProperty(f)!==d.hasOwnProperty(f))return!1;if(typeof e[f]!=typeof d[f])return!1}for(f in d){if(e.hasOwnProperty(f)!==d.hasOwnProperty(f))return!1;if(typeof e[f]!=typeof d[f])return!1;switch(typeof d[f]){case"object":case"function":if(a.push(d),b.push(e),!c(d[f],e[f]))return!1;a.pop(),b.pop();break;default:if(d[f]!==e[f])return!1}}return!0}var a,b;if(arguments.length<1)return!0;for(var d=1,e=arguments.length;e>d;d++)if(a=[],b=[],!c(arguments[0],arguments[d]))return!1;return!0}

/**
 * find val in array
 * @param  {Array} array  will be searched
 * @param          val    will be searched for
 * @return {Boolean}      true if found, false otherwise
 */
arrayConsist = function(array, val) {
    for (var i in array) if (array[i] === val) return true;
    return false;
}
/** 
 * make new instance of testit
 * Make it availible from outside.
 */
scope.test = new testit();

})(this);