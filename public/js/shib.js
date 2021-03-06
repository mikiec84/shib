var shibnotifications = [];
var shibdata = {};
var shibselectedquery = null;
var shibselectedquery_dom = null;

var shib_QUERY_STATUS_CHECK_INTERVAL = 5000;
var shib_QUERY_EDITOR_WATCHER_INTERVAL = 500;
var shib_NOTIFICATION_CHECK_INTERVAL = 100;
var shib_NOTIFICATION_DEFAULT_DURATION_SECONDS = 10;
var shib_RUNNING_QUERY_UPDATE_INTERVAL = 15000;
var shib_RUNNING_QUERY_LOAD_INITIALY = 2000;

var engineInfo = null;
var authInfo = null;
var authEnabled = false;

function authAjax(req){
  if (authInfo)
    req['headers'] = { 'X-Shib-AuthInfo': authInfo };
  $.ajax(req);
}

function authGet(url, callback){
  authAjax({url: url, success: callback});
}

function authGetJSON(url, callback){
  authAjax({url: url, success: callback, dataType: "json"});
}

function authGetText(url, callback){
  authAjax({url: url, success: callback, dataType: "text"});
}

$(function(){
  check_auth_initial();

  load_tabs({callback:function(){
    follow_current_uri();
    setInterval(check_selected_running_query_state, shib_QUERY_STATUS_CHECK_INTERVAL);
    setInterval(show_notification, shib_NOTIFICATION_CHECK_INTERVAL);
    setInterval(update_running_queries, shib_RUNNING_QUERY_UPDATE_INTERVAL);
    setTimeout(update_running_queries, shib_RUNNING_QUERY_LOAD_INITIALY);
  }});
  
  //hover states on the static widgets
  $('ul.operationitems li').hover(
    function() { $(this).addClass('ui-state-hover'); }, 
    function() { $(this).removeClass('ui-state-hover'); }
  );

  $('#tables_diag,#describe_diag')
      .css('text-decoration', 'line-through')
      .css('cursor', 'wait');
  load_pairs(function(){
    $('#tables_diag').click(function(event){show_tables_dialog();});
    $('#table_pairs').change(function(event){show_tables_dialog();});
    $('#describe_diag').click(function(event){show_describe_dialog();});
    $('#desc_pairs').change(function(event){show_describe_dialog();});
    $('#taglist_diag').click(function(event){show_taglist_dialog();});
    $('#tables_diag,#describe_diag,#taglist_diag')
        .css('text-decoration', '')
        .css('cursor', 'pointer');
  });

  $('#new_button').click(initiate_mainview);
  $('#copy_button').click(copy_selected_query);
  $('#clip_button').click(clip_selected_query);
  $('#unclip_button').click(unclip_selected_query);

  $('#auth_button').click(show_auth_dialog);
  $('#execute_button').click(execute_query);
  $('#giveup_button').click(giveup_query);
  $('#status_button').click(show_status_query);
  $('#delete_button').click(delete_query);
  $('#display_full_button').click(function(){show_result_query({range:'full'});});
  $('#display_head_button').click(function(){show_result_query({range:'head'});});
  $('#download_tsv_button').click(function(){download_result_query({format:'tsv'});});
  $('#download_csv_button').click(function(){download_result_query({format:'csv'});});

  $('#edit_tag_button').click(show_edit_tag_dialog);
  $('#add_tag_submit').click(execute_add_tag);
  $('#remove_tag_submit').click(execute_remove_tag);
  $('#auth_submit').click(check_auth);
});

/* engine/database pairs list loading (just after page loading) */

$.template("pairTemplate",
           '<option data-engine="${Engine}" data-database="${Dbname}" value="${Engine}/${Dbname}">${Engine} - ${Dbname}</option>');
function load_pairs(callback) {
  authGet('/engines?=' + (new Date()).getTime(), function(data){
    engineInfo = data;

    $('select#table_pairs,select#desc_pairs,select#exec_pairs').empty();
    $.tmpl('pairTemplate',
        engineInfo.pairs.map(function(pair){ return { Engine:pair[0], Dbname:pair[1] }; })
    ).appendTo('select#table_pairs');
    $.tmpl('pairTemplate',
        engineInfo.pairs.map(function(pair){ return { Engine:pair[0], Dbname:pair[1] }; })
    ).appendTo('select#desc_pairs');
    $.tmpl('pairTemplate',
        engineInfo.pairs.map(function(pair){ return { Engine:pair[0], Dbname:pair[1] }; })
    ).appendTo('select#exec_pairs');
    if (callback)
      callback();
  });
};

/* authentication check initially */

function check_auth_initial() {
  authAjax({
    type: "POST",
    url: '/auth',
    data: {},
    cache: false,
    success: function(data){
      authInfo = data.authInfo;
      authEnabled = data.enabled;
      // show execute button instead of auth button
      if ($('#auth_button:visible').size() > 0)
        show_editbox_buttons(['execute_button']);
      $('span#authRealm').text(data.realm);
    },
    error: function(jqXHR, textStatus, errorThrown){
      authInfo = null;
      var data = JSON.parse(jqXHR.responseText);
      authEnabled = data.enabled;
      $('span#authRealm').text(data.realm);
    }
  });
}

/* basic data operations */

function set_execute_query_list(list) {
  if (! window.localStorage) return;
  window.localStorage.executeList = JSON.stringify(list);
};

function delete_execute_query_item(queryid) {
  if (! window.localStorage) return;
  window.localStorage.executeList = JSON.stringify(execute_query_list().filter(function(v){return v !== queryid;}));
};

function execute_query_list() {
  if (! window.localStorage) return [];
  var list = [];
  try {
    var listString = window.localStorage.executeList;
    if (listString && listString.length > 0)
      list = JSON.parse(listString);
  } catch (e) { set_execute_query_list([]); list = []; }
  return list;
};

function push_execute_query_list(queryid, refresh) {
  if (! window.localStorage) return;
  var list = execute_query_list();
  if (refresh)
    list = list.filter(function(v){return v !== queryid;});
  else if (list.filter(function(v){return v === queryid;}).length > 0)
    return;
  if (list.length > 10) list = list.slice(0,10);
  list.unshift(queryid);
  set_execute_query_list(list);
};

function set_bookmark_query_list(list) {
  if (! window.localStorage) return;
  window.localStorage.bookmark = JSON.stringify(list);
};

function delete_bookmark_query_list(queryid) {
  if (! window.localStorage) return;
  window.localStorage.bookmark = JSON.stringify(bookmark_query_list().filter(function(v){return v !== queryid;}));
};

function bookmark_query_list() {
  if (! window.localStorage) return [];
  var list = [];
  try {
    var listString = window.localStorage.bookmark;
    if (listString && listString.length > 0)
      list = JSON.parse(listString);
  } catch (e) { set_bookmark_query_list([]); list = []; }
  return list;
};

function exists_in_bookmark_query_list(queryid) {
  if (! window.localStorage) return false;
  return bookmark_query_list().filter(function(v){return v === queryid;}).length > 0;
};

function push_bookmark_query_list(queryid) {
  if (! window.localStorage) return;
  var list = bookmark_query_list().filter(function(v){return v !== queryid;});
  list.unshift(queryid);
  set_bookmark_query_list(list);
};

function query_last_result(query) {
  var obj = null;
  if (query && query.results && query.results.length > 0 && query.results[query.results.length - 1])
    if ((obj = shibdata.result_cache[query.results[query.results.length - 1].resultid]) !== null)
      return obj;
  return null;
};
function query_second_last_result(query) {
  var obj = null;
  if (query && query.results && query.results.length > 1 && query.results[query.results.length - 2])
    if ((obj = shibdata.result_cache[query.results[query.results.length - 2].resultid]) !== null)
      return obj;
  return null;
};
function query_last_done_result(query) {
  var last = query_last_result(query);
  if (last && last.state == 'done')
    return last;
  return query_second_last_result(query);
}

function query_result_schema_label(result){
  return 'fields: ' + result.schema.map(function(field){return field.name + '(' + field.type + ')';}).join(', ');
};

function query_current_state(query) {
  if (!query)
    return null;
  if (query && (! query.queryid))
    show_error('UI Bug', 'query id unknown', 5, query);

  if (shibdata.query_state_cache[query.queryid])
    return shibdata.query_state_cache[query.queryid];

  var state = null;
  var lastresult = query_last_result(query);
  if (! lastresult)
    state = 'running';
  else if (lastresult.state === 'running') {
    var secondlast = query_second_last_result(query);
    if (secondlast && secondlast.state === 'done')
      state = 're-running';
    else
      state = 'running';
  }
  else if (lastresult.state === 'error')
    state = 'error';
  else
    state = 'executed';

  shibdata.query_state_cache[query.queryid] = state;
  return state;
};

function timelabel_elapsed(completed_at, executed_at){
  if (!completed_at || !executed_at)
    return 'unknown times';
  var seconds = Math.floor(((new Date(completed_at)) - (new Date(executed_at))) / 1000);
  if (seconds < 60)
    return seconds + ' seconds';
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return minutes + ' minutes';
  return Math.floor(minutes / 60) + ' hours';
};

/* uri and history operation */

function follow_current_uri() {
  if (window.location.pathname.indexOf('/q/') === 0) {
    var queryid = window.location.pathname.substring('/q/'.length);
    if (/^[0-9a-z]{32}$/.exec(queryid)) // queryid is md5 (16bytes) hexdigest (32chars)
      follow_current_uri_query(queryid);
  }
  if (window.location.pathname.indexOf('/t/') === 0) {
    var tag = window.location.pathname.substring('/t/'.length);
    follow_current_uri_tag(tag);
  }
};

function follow_current_uri_query(queryid){
  var query = shibdata.query_cache[queryid];
  if (query) {
    update_mainview(query);
    return;
  }

  authAjax({
    url: '/query/' + queryid,
    type: 'GET',
    cache: false,
    error: function(jqXHR, textStatus, errorThrown){
      show_error('Unknown query id', 'cannot get query object with specified id', 10);
    },
    success: function(data, textStatus, jqXHR){
      query = data;
      shibdata.query_cache[queryid] = query;
      var resultids = data.results.map(function(v){return v.resultid;});
      authAjax({
        url: '/results',
        type: 'POST',
        dataType: 'json',
        data: {ids: resultids},
        success: function(data){
          data.results.forEach(function(result1){
            if (! result1)
              return;
            shibdata.result_cache[result1.resultid] = result1;
          });
          update_mainview(query);
        }
      });
    }
  });
}

function follow_current_uri_tag(tag){
  authAjax({
    url: '/tagged/' + tag,
    type: 'GET',
    cache: false,
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to get detail status', msg);
    },
    success: function(queryids) {
      load_query_tree(queryids, function(){
        update_tabs(true, {tag:tag, queryids:queryids});
      });
    }
  });
}

function update_history_by_query(query) {
  if (! window.history.pushState ) // if pushState not ready
    return;
  if (query === null) {
    window.history.pushState('','', '/');
    return;
  }
  window.history.pushState(query.queryid, '', '/q/' + query.queryid);
};

window.addEventListener("popstate", function (event) {
  if (event.state === null || event.state === undefined || event.state.length < 32)
    return;
  var query = shibdata.query_cache[event.state];
  if (! query) {
    show_error('UI BUG', 'unknown queryid from history event.state', 10);
    return;
  }
  update_mainview(query);
}, false);

/* notifications */

var shib_current_notification = null;
var shib_current_notification_counter = 0;
function show_notification(event){ /* event object is not used */
  if (shib_current_notification === null && shibnotifications.length == 0)
    return;
  if (shib_current_notification !== null && shibnotifications.length == 0){
    shib_current_notification_counter -= 1;
    if (shib_current_notification_counter < 1) {
      shib_current_notification.fadeOut(100);
      shib_current_notification_counter = 0;
    }
    return; 
  }
  var next = shibnotifications.shift();
  shib_current_notification_counter = ( next.duration || shib_NOTIFICATION_DEFAULT_DURATION_SECONDS ) * 10;
  if (shib_current_notification) {
    shib_current_notification.fadeOut(100, function(){
      shib_current_notification = update_notification(next.type, next.title, next.message);
      shib_current_notification.fadeIn(100);
    });
  }
  else {
    shib_current_notification = update_notification(next.type, next.title, next.message);
    shib_current_notification.fadeIn(100);
  }
};

function update_notification(type, title, message){
  if (type === 'info') {
    $('#infotitle').text(title);
    $('#infomessage').text(message);
    return $('#infoarea');
  }
  $('#errortitle').text(title);
  $('#errormessage').text(message);
  return $('#errorarea');
};

function show_info(title, message, duration){
  shibnotifications.push({type:'info', title:title, message:message, duration:duration});
};

function show_error(title, message, duration, optional_object){
  shibnotifications.push({type:'error', title:title, message:message, duration:duration});
  if (optional_object)
    console.log(optional_object);
};

/* dialog */

function show_tables_dialog() {
  $('#tables')
    .dynatree('destroy')
    .empty()
    .hide();
  $('#tablesdiag').dialog({modal:false, resizable:true, height:400, width:400, maxHeight:650, maxWidth:950});
  $('#tablesdiag .loadingimg').show();

  var selected = $('#table_pairs option:selected');
  var engine = selected.data('engine');
  var dbname = selected.data('database');

  var get_path = '/tables?engine=' + encodeURIComponent(engine) + '&db=' + encodeURIComponent(dbname);
  authGet(get_path, function(data){
    $('#tablesdiag .loadingimg').hide();
    $('#tables')
      .show()
      .dynatree({
        children: data.map(function(v){return {title: v, key: v, isFolder: true, isLazy: true};}),
        autoFocus: false,
        autoCollapse: true,
        clickFolderMode: 2,
        activeVisible: false,
        onLazyRead: function(node){
          node.appendAjax({
            url: '/partitions',
            data: { key: node.data.key, engine: engine, db: dbname },
            cache: false
          });
        }
      });
  });
};

function show_describe_dialog() {
  $('#describes')
    .dynatree('destroy')
    .empty()
    .hide();
  $('#describediag').dialog({modal:false, resizable:true, height:400, width:400, maxHeight:650, maxWidth:950});
  $('#describediag .loadingimg').show();

  var selected = $('#desc_pairs option:selected');
  var engine = selected.data('engine');
  var dbname = selected.data('database');

  var get_path = '/tables?engine=' + encodeURIComponent(engine) + '&db=' + encodeURIComponent(dbname);
  authGet(get_path, function(data){
    $('#describediag .loadingimg').hide();
    $('#describes')
      .show()
      .dynatree({
        children: data.map(function(v){return {title: v, key: v, isFolder: true, isLazy: true};}),
        autoFocus: false,
        autoCollapse: true,
        clickFolderMode: 2,
        activeVisible: false,
        onLazyRead: function(node){
          node.appendAjax({
            url: '/describe',
            data: { key: node.data.key, engine: engine, db: dbname },
            cache: false
          });
        }
      });
  });
};

$.template("tagForTagListTemplate", '<li><a href="/t/${Tag}">${Tag}</a></li>');

function show_taglist_dialog() {
  $('ul#taglist').empty().hide();

  $('#taglistdiag').dialog({modal:false, resizable:true, height:400, width:400, maxHeight:650, maxWidth:950});
  $('#taglistdiag .loadingimg').show();

  authGetJSON('/taglist', function(tags){
    $.tmpl("tagForTagListTemplate", tags.map(function(t){return {Tag:t};}))
     .appendTo('ul#taglist');
    $('#taglistdiag .loadingimg').hide();
    $('ul#taglist').show();
  });
}

$.template("detailStatusTemplate",
           '<table>' +
           '<tr><td>Job ID</td><td>${JobID}</td></tr>' +
           '<tr><td>State</td><td>${State}</td></tr>' +
           '<tr><td>Priority</td><td>${Priority}</td></tr>' +
           '<tr><td>URL</td><td><a href="${Url}">${Url}</a></td></tr>' +
           '<tr><td>Complete</td><td>Map:${MapComplete}, Reduce:${ReduceComplete}</td></tr>' +
           '</table>');
$.template("detailStatusTemplate2",
           '<table>' +
           '<tr><td>Job ID</td><td>${JobID}</td></tr>' +
           '<tr><td>State</td><td>${State}</td></tr>' +
           '<tr><td>Priority</td><td>${Priority}</td></tr>' +
           '<tr><td>URL</td><td><a href="${Url}">${Url}</a></td></tr>' +
           '<tr><td>Complete</td><td>${Complete}</td></tr>' +
           '</table>');
function show_status_dialog(target) {
  $('#detailstatus').empty().hide();
  $('#detailstatusdiag').dialog({modal:true, resizable:false, height:200, width:600, maxHeight:200, maxWidth:950});
  $('#detailstatusdiag .loadingimg').show();
  authAjax({
    url: '/detailstatus/' + target.queryid,
    type: 'GET',
    cache: false,
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to get detail status', msg);
    },
    success: function(state) {
      /*
       var returnedValus = {
         jobid: 'job_201304011701_1912',
         name: 'shib-3578d8d4f5a1812de7a7714f5b108776',
         priority: 'NORMAL',
         state: 'RUNNING',
         trackingURL: 'http://master.hadoop.local:50030/jobdetails.jsp?jobid=job_201304011701_1912',
         startTime: 'Thu Apr 11 2013 16:06:40 (JST)',
         mapComplete: 89,
         reduceComplete: 29,
         complete: 80,
         hiveQueryId: 'hive_20130411160606_46b1b669-3a64-4174-899e-bb1bf53e90db',
         hiveQueryString: 'SELECT ...'
       };
       // "complete" and "mapComplete/reduceComplete" are exclusive
       */
      var template = "detailStatusTemplate";
      var out = {
          JobID: state['jobid'], State: state['state'], Priority: state['priority'],
          Url: state['trackingURL']
      };
      if (state['complete']) {
        template = "detailStatusTemplate2";
        out['Complete'] = String(state['complete'] || 0) + '%';
      } else {
        out['MapComplete'] = String(state['mapComplete'] || 0) + '%';
        out['ReduceComplete'] = String(state['ReduceComplete'] || 0) + '%';
      }

      $.tmpl(template,[ out ]).appendTo('#detailstatus');
      $('#detailstatusdiag .loadingimg').hide();
      $('#detailstatus').show();
    }
  });
}

$.template('removeTagOptionTemplate', '<option>${Tag}</option>');

function show_edit_tag_dialog(){
  var query = shibselectedquery;
  $('input#add_tag_text').val('');
  $('select#remove_tag_list').empty();
  $('#removeTagPart').hide();

  authAjax({
    url: '/tags/' + query.queryid,
    type: 'GET',
    cache: false,
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to get detail status', msg);
    },
    success: function(tags) {
      if (tags.length > 0) {
        $.tmpl("removeTagOptionTemplate", tags.map(function(t){return {Tag:t};}))
          .appendTo('select#remove_tag_list');
        $('#removeTagPart').show();
      }

      $('#edittagdiag').dialog({modal:true, resizable:false, height:100, width:250});
    }
  });
}

function execute_add_tag(){
  var query = shibselectedquery;
  authAjax({
    url: '/addtag',
    type: 'POST',
    cache: false,
    data: { queryid: query.queryid, tag: $('input#add_tag_text').val() },
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to add a tag', msg);
    },
    success: function(state) {
      $('#edittagdiag').dialog('close');
      show_editbox_querytags(query);
    }
  });
}

function execute_remove_tag(){
  var query = shibselectedquery;
  authAjax({
    url: '/deletetag',
    type: 'POST',
    cache: false,
    data: { queryid: query.queryid, tag: $('select#remove_tag_list').val() },
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to remove a tag', msg);
    },
    success: function(state) {
      $('#edittagdiag').dialog('close');
      show_editbox_querytags(query);
    }
  });
}

function show_auth_dialog(){
  $('#authinputdiag').dialog({modal:true, resizable:false, height:150, width:400});
}

/* right pane operations */

function update_tabs(reloading, taginfo, history_disabled) {
  if (reloading) {
    $('#listSelector').tabs('destroy');
    if (window.localStorage) {
      $('#tab-yours').accordion('destroy');
      $('#tab-bookmark').accordion('destroy');
    }
    $('#tab-tag').accordion('destroy');
    $('#tab-history').accordion('destroy');
  }

  if (window.localStorage) {
    update_yours_tab();
    update_bookmark_tab();
    $("#tab-yours").accordion({header:"h3", autoHeight:false});
    $("#tab-bookmark").accordion({header:"h3", autoHeight:false});
  }
  else {
    $('#index-yours,#tab-yours').remove();
    $('#index-bookmark,#tab-bookmark').remove();
  }

  if (history_disabled) {
    $('#tab-history').empty();
  } else {
    update_history_tab(reloading);
    $("#tab-history").accordion({header:"h3", autoHeight:false});
  }

  if (taginfo) {
    if ($('#listSelector ul li#index-tag').size() === 0){
      $('#listSelector ul li#index-yours').before('<li id="index-tag"><a href="#tab-tag"> tag</a></li>');
      $('#listSelector div#tab-yours').before('<div id="tab-tag"></div>');
    }
    update_tag_tab(taginfo.tag, taginfo.queryids);
    $('#tab-tag').accordion({header:"h3", autoHeight:false});
  } else {
    $('#index-tag,#tab-tag').remove();
  }

  $("#listSelector").tabs();

  $('.queryitem').click(select_queryitem);
};

function load_tabs(opts) {
  var history_disabled = false;
  var callback = function() {
    update_tabs(opts.reload, opts.taginfo, history_disabled);
    if (opts.callback)
      opts.callback();
  };

  shibdata.query_cache = {};
  shibdata.query_state_cache = {};
  shibdata.result_cache = {};

  authGetJSON('/summary_bulk', function(data){
    if (data.disabled) {
      history_disabled = true;
    } else {
      shibdata.history = data.history; /* ["201302", "201301", "201212", "201211"] */
      shibdata.history_ids = data.history_ids; /* {"201302":[query_ids], "201301":[query_ids], ...} */
    }

    /* data.query_ids is sum of values of history_ids */
    var queryids = (data.query_ids || []).concat( execute_query_list() ).concat( bookmark_query_list() );
    load_query_tree(queryids, callback);
  });
};

$.template("queryItemTemplate",
           '<div><div class="queryitem" id="query-${QueryId}">' +
           '  <div class="queryitem_information"><table><tr>' +
           '    <td width="80%">${Information}</td>' +
           '    <td width="20%" style="text-align: right;"><a href="/q/${QueryKey}">URL</a></td>' +
           '  </tr></table></div>' +
           '  <div class="queryitem_statement">${Statement}</div>' +
           '  <div class="queryitem_status">' +
           '    <span class="status_${Status}">${Status}</span>' +
           '    <span class="queryitem_etc">${Etc}</span>' +
           '    ' +
           '  </div>' +
           '</div></div>');

function create_queryitem_object(queryid, id_prefix){
  var query = shibdata.query_cache[queryid];
  if (! query)
    return '';
  var lastresult = query_last_result(query);
  var executed_at = (lastresult && lastresult.executed_at) || '-';
  return {
    QueryKey: query.queryid,
    QueryId: (id_prefix || '') + query.queryid,
    Information: executed_at,
    Statement: query.querystring,
    Status: query_current_state(query),
    Etc: lastresult ?
      (timelabel_elapsed(lastresult.completed_at, lastresult.executed_at) +
       ((lastresult && lastresult.bytes && lastresult.lines &&
         (', ' + lastresult.bytes + ' bytes, ' + lastresult.lines + ' lines')) || '')
      ) : 'waiting'
  };
};

function update_yours_tab(){
  $('#tab-yours')
    .empty()
    .append('<div><h3><a href="#">your queries</a></h3><div id="yours-idlist"></div></div>');
  if (execute_query_list().length > 0)
    $.tmpl("queryItemTemplate",
           execute_query_list().map(function(id){return create_queryitem_object(id, 'yours-');})
          ).appendTo('#tab-yours div div#yours-idlist');
};

function update_bookmark_tab(){
  $('#tab-bookmark')
    .empty()
    .append('<div><h3><a href="#">bookmark</a></h3><div id="bookmark-idlist"></div></div>');
  if (bookmark_query_list().length > 0)
    $.tmpl("queryItemTemplate",
           bookmark_query_list().map(function(id){return create_queryitem_object(id, 'bookmark-');})
          ).appendTo('#tab-bookmark div div#bookmark-idlist');
};

function update_history_tab(){
  var history_num = 1;
  $('#tab-history').empty();
  shibdata.history.forEach(function(history1){
    var historyitemlistid = 'history-idlist-' + history_num;
    $('#tab-history').append('<div><h3><a href="#">' + history1 + '</a></h3><div id="' + historyitemlistid + '"></div></div>');
    $.tmpl("queryItemTemplate",
           shibdata.history_ids[history1].map(function(id){
             return create_queryitem_object(id, 'history-');})
          ).appendTo('#tab-history div div#' + historyitemlistid);
    history_num += 1;
  });
};

function update_tag_tab(tag, queryids){
  $('#tab-tag')
      .empty()
      .append('<div><h3><a href="#">TAG:' + tag + '</a></h3><div id="tag-idlist"></div></div>');
  if (queryids.length > 0)
    $.tmpl("queryItemTemplate", queryids.map(function(id){return create_queryitem_object(id, 'tag-');}))
     .appendTo('#tab-tag div div#tag-idlist');
}

function deselect_and_new_query(quiet){
  release_selected_query();
  update_editbox(null);
  if (! quiet)
    show_info('', 'selected query released', 5);
};

function set_selected_query(query, dom){
  release_selected_query();
  $(dom).addClass('queryitem_selected');
  shibselectedquery_dom = dom;
  shibselectedquery = query;
};

function release_selected_query(){
  if (! shibselectedquery)
    return;
  $(shibselectedquery_dom).removeClass('queryitem_selected');
  shibselectedquery_dom = null;
  shibselectedquery = null;
};

function select_queryitem(event){
  var target_dom = $(event.target).closest('.queryitem');
  var target_dom_id = target_dom.attr('id');
  var dom_id_regex = /^query-(yours|bookmark|history|tag)-([0-9a-f]+)$/;
  var match_result = dom_id_regex.exec(target_dom_id);
  if (match_result === null) {
    show_error("UI Bug", "Selected DOM id invalid:" + target_dom_id, 5);
    return;
  }
  var query = shibdata.query_cache[match_result[2]];
  if (! query) {
    show_error("UI Bug", "Selected query not loaded on browser:" + match_result[2], 5);
    return;
  }
  
  set_selected_query(query, target_dom);
  update_history_by_query(query);
  update_mainview(query);
};

/* left pane view updates */

function initiate_mainview(eventNotUsed, quiet) {
  deselect_and_new_query(quiet);
  update_queryeditor(true, '');
  update_editbox(null, 'not executed');
  update_history_by_query(null);
};

function copy_selected_query(eventNotUsed) {
  var querystring = shibselectedquery.querystring;
  var engine = shibselectedquery.engine;
  var dbname = shibselectedquery.dbname;
  deselect_and_new_query();
  update_queryeditor(true, querystring);
  update_editbox(null, 'not executed');
  var exec_pairs_value = null;
  $('select#exec_pairs option').each(function(i,element){
    var e = $(element);
    if (e.data('engine') === engine && e.data('database') === dbname)
      exec_pairs_value = e.val();
  });
  if (! exec_pairs_value)
    exec_pairs_value = $($('select#exec_pairs option')[0]).val();
  $('select#exec_pairs').val(exec_pairs_value);
  update_history_by_query(null);
};

function clip_selected_query(eventNotUsed) {
  var clip_query_id = shibselectedquery.queryid;
  push_bookmark_query_list(clip_query_id);
  load_tabs({
    reload:true,
    callback:function(){
      $("#listSelector").tabs('option', 'selected', 1);
    }
  });
  update_editbox(shibselectedquery);
};

function unclip_selected_query(eventNotUsed) {
  var unclip_query_id = shibselectedquery.queryid;
  delete_bookmark_query_list(unclip_query_id);
  load_tabs({
    reload:true,
    callback:function(){
      $("#listSelector").tabs('option', 'selected', 1);
    }
  });
  update_editbox(shibselectedquery);
};

function update_mainview(query){
  shibselectedquery = query;
  update_queryeditor(false, query.querystring);
  update_editbox(query);
};

function update_queryeditor(editable, querystring) {
  var editor = $('#queryeditor');
  editor.val(querystring);
  if (editable)
    editor.attr('readonly', false).removeClass('readonly');
  else
    editor.attr('readonly', true).addClass('readonly');
};

function update_editbox(query, optional_state) {
  if (query) {
    $('#copy_button').show();
    if (exists_in_bookmark_query_list(query.queryid)) {
      $('#clip_button').hide();
      $('#unclip_button').show();
    } else {
      $('#clip_button').show();
      $('#unclip_button').hide();
    }
  } else {
    $('#copy_button,#clip_button,#unclip_button').hide();
  }

  show_query_exec_pairs(query);

  var state = optional_state || query_current_state(query);
  switch (state) {
  case 'not executed':
  case undefined:
  case null:
    $('#engineselector').show();
    if (authInfo) {
      show_editbox_buttons(['execute_button']);
    } else {
      show_editbox_buttons(['auth_button']);
    }
    change_editbox_querystatus_style(query, 'not executed');
    show_editbox_querytags(null);
    break;
  case 'running':
    $('#engineselector').hide();
    if (engineInfo && engineInfo.monitor[query.engine]) {
      show_editbox_buttons(['giveup_button', 'status_button']);
    }
    else {
      show_editbox_buttons(['giveup_button']);
    }
    change_editbox_querystatus_style(query, 'running');
    show_editbox_querytags(null);
    break;
  case 'executed':
  case 'done':
    $('#engineselector').hide();
    show_editbox_buttons(['delete_button', 'display_full_button', 'display_head_button',
                          'download_tsv_button', 'download_csv_button']);
    change_editbox_querystatus_style(query, 'executed', query_last_result(query));
    show_editbox_querytags(query);
    break;
  case 'error':
    $('#engineselector').hide();
    show_editbox_buttons(['delete_button']);
    change_editbox_querystatus_style(query, 'error', query_last_result(query));
    show_editbox_querytags(null);
    break;
  default:
    show_error('UI Bug', 'unknown query status:' + state, 5, query);
  }
}

function show_editbox_buttons(buttons){
  var allbuttons = [
    'auth_button', 'execute_button', 'giveup_button', 'status_button', 'delete_button',
    'display_full_button', 'display_head_button', 'download_tsv_button', 'download_csv_button'
  ];
  if (! buttons)
    buttons = [];
  allbuttons.forEach(function(b){
    if (buttons.indexOf(b) > -1)
      $('li#' + b).show();
    else
      $('li#' + b).hide();
  });
}

function show_query_exec_pairs(query){
  if (!query || !query.engine) {
    $('#queryexec').hide();
    $('span#queryengine').text('');
    $('span#querydatabase').text('');
  }
  else {
    $('span#queryengine').text(query.engine);
    $('span#querydatabase').text(query.dbname || '(default)');
    $('#queryexec').show();
  }
}

function change_editbox_querystatus_style(query, state, result){
  var allstates = {
    'not executed':{classname:'status_not_executed', result:false},
    'running':{classname:'status_running', result:false},
    'executed':{classname:'status_executed', result:true},
    'error':{classname:'status_error', result:true},
    're-running':{classname:'status_re-running', result:true}
  };
  if (state === 'done')
    state = 'executed';

  if (allstates[state]) {
    var allclasses = 'status_not_executed status_running status_executed status_error status_re-running';
    $('span#querystatus')
      .removeClass(allclasses)
      .addClass((allstates[state]).classname)
      .text(state);

    if (allstates[state]['result'] && result) {
      $('#queryresult').show();
      if (result.error) {
        $('span#queryresultlines').text(result.error);
        $('span#queryresultbytes').text("");
        $('#queryresultelapsed').text(timelabel_elapsed(result.completed_at, result.executed_at));
        $('#queryresultschema').text('');
      }
      else {
        $('span#queryresultlines').text(" " + result.lines + " lines, ");
        $('span#queryresultbytes').text(" " + result.bytes + " bytes");
        $('#queryresultelapsed').text(timelabel_elapsed(result.completed_at, result.executed_at));
        $('#queryresultschema').text(query_result_schema_label(result));
      }
    }
    else {
      $('#queryresult').hide();
    }
  }
}

$.template("queryTagTemplate",
    '<li class="tag ui-state-default ui-corner-all" data-tagtext="${Tag}">' +
    '<span class="ui-icon ui-icon-search"></span> <a href="/t/${Tag}">${Tag}</a>' +
    '</li>');

function show_editbox_querytags(query){
  $('ul#querytags li.tag').remove();
  if (query === null || query === undefined) {
    $('ul#querytags').hide();
    return;
  }

  $('ul#querytags').show();
  authAjax({
    url: '/tags/' + query.queryid,
    type: 'GET',
    cache: false,
    error: function(jqXHR, textStatus, err) {
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try { msg = JSON.parse(jqXHR.responseText).message; }
      catch (e) { msg = jqXHR.responseText; }
      show_error('Failed to get detail status', msg);
    },
    success: function(tags) {
      $.tmpl("queryTagTemplate",
          tags.map(function(tag){ return {Tag:tag}; }))
       .appendTo('ul#querytags');
    }
  });
}


/* query and result load/reload/caching */

function load_query_tree(queryids, callback){
  load_queries(queryids, function(err, queries){
    var resultids = [];
    queries.forEach(function(v){
      if (v.results && v.results.length > 0)
        resultids = resultids.concat(v.results.map(function(r){return r && r.resultid;}));
    });
    // load_results does not call ajax when argument is empty
    load_results(resultids, function(err, results){callback();});
  });
}

function load_queries(queryids, callback){
  if (queryids.length < 1) {
    callback(null, []); return;
  }
  authAjax({
    url: '/queries',
    type: 'POST',
    dataType: 'json',
    data: {ids: queryids},
    success: function(data){
      data.queries.forEach(function(query1){
        shibdata.query_cache[query1.queryid] = query1;
      });
      if (callback)
        callback(null, data.queries);
    }
  });
};

function load_results(resultids, callback){
  if (resultids.length < 1) {
    callback(null, []); return;
  }
  authAjax({
    url: '/results',
    type: 'POST',
    dataType: 'json',
    data: {ids: resultids},
    success: function(data){
      data.results.forEach(function(result1){
        if (! result1)
          return;
        shibdata.result_cache[result1.resultid] = result1;
      });
      if (callback)
        callback(null, data.results);
    }
  });
};

/* query status auto-updates */

function check_selected_running_query_state(event){ /* event object is not used */
  if (! shibselectedquery)
    return;
  var s = query_current_state(shibselectedquery);
  if (s === 'running' || s === 're-running')
    update_query(shibdata.query_cache[shibselectedquery.queryid]);
};

function update_query_display(query) {
  update_mainview(query);
  show_info('Query state updated', '', 5);
  load_tabs({reload:true});
};

function update_query(query){
  if (! query)
    return;
  authGet('/status/' + query.queryid, function(data){
    if (query_current_state(query) == data)
      return;

    shibdata.query_state_cache[query.queryid] = data;

    authGet('/query/' + query.queryid, function(new_query){
      shibdata.query_cache[new_query.queryid] = new_query;
      if (new_query.results.length > 0) {
        authGet('/lastresult/' + new_query.queryid, function(new_result){
          shibdata.result_cache[new_result.resultid] = new_result;
          update_query_display(new_query);
        });
      }
      else {
        update_query_display(new_query);
      }
    });
  });
};

$.template("runningsTemplate",
           '<div><a href="/q/${QueryId}">${QueryId}</a> ${Runnings}</div>');

function update_running_queries(event){
  authGet('/runnings', function(data){
    $('#runnings').empty();
    if (data.length < 1) {
      $('<div>no running queries</div>').appendTo('#runnings');
      return;
    }
    $('#runnings').show();
    $.tmpl("runningsTemplate",
           data.map(function(pair){return {QueryId: pair[0], Runnings: pair[1]};})
          ).appendTo('#runnings');
  });
};

/* left pane interactions (user-operation interactions) */

function check_auth(e) {
  e.preventDefault();

  var username = $('#username').val();
  var password = $('#password').val();
  authAjax({
    type: "POST",
    url: '/auth',
    data: {username: username, password: password},
    cache: false,
    success: function(data, textStatus, jqXHR){
      authInfo = data.authInfo;
      if ($('#auth_button:visible').size() > 0)
        show_editbox_buttons(['execute_button']);
      $('#authinputdiag').dialog('close');
      show_info('User/Pass check', 'success');
      load_pairs(); // reload engine-database pairs w/ authenticated username
    },
    error: function(jqXHR, textStatus, errorThrown){
      authInfo = null;
      $('#authinputdiag').dialog('close');
      show_error('User/Pass check', 'failed', 10);
    }
  });
}

function execute_query() {
  if (! authInfo) {
    show_error('UI Bug', 'check authentication at first!');
    return;
  }
  if (shibselectedquery) {
    show_error('UI Bug', 'execute_query should be enable with not-saved-query objects');
    return;
  }
  var selected = $('#exec_pairs option:selected');
  var engine = selected.data('engine');
  var dbname = selected.data('database');

  var querystring = $('#queryeditor').val();
  var postdata = {
    engineLabel: engine,
    dbname: dbname,
    querystring: querystring,
    authInfo: authInfo
  };

  authAjax({
    url: '/execute',
    type: 'POST',
    dataType: 'json',
    data: postdata,
    error: function(jqXHR, textStatus, err){
      var msg = null;
      try {
        msg = JSON.parse(jqXHR.responseText).message;
      }
      catch (e) {
        msg = jqXHR.responseText;
      }
      show_error('Cannot Execute Query', msg);
    },
    success: function(query){
      show_info('Query now waiting to run', '');
      shibdata.query_cache[query.queryid] = query;
      update_mainview(query);
      if (window.localStorage) {
        push_execute_query_list(query.queryid);
      }
      update_history_by_query(query);
      load_tabs({reload:true});
    }
  });
};

function giveup_query() {
  if (! shibselectedquery) {
    show_error('UI Bug', 'giveup_query should be enable with non-saved-query objects');
    return;
  }
  authAjax({
    url: '/giveup',
    type: 'POST',
    dataType: 'json',
    data: {queryid: shibselectedquery.queryid},
    error: function(jqXHR, textStatus, err){
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try {
        msg = JSON.parse(jqXHR.responseText).message;
      }
      catch (e) {
        msg = jqXHR.responseText;
      }
      show_error('Cannot GiveUp Query', msg);
    },
    success: function(query){
      show_info('Query gived-up', '');
      shibdata.query_cache[query.queryid] = query;
      shibdata.query_state_cache[query.queryid] = 'error';
      load_results(query.results.map(function(v){return v.resultid;}), function(err){
        update_mainview(query);
        load_tabs({reload:true});
      });
    }
  });
};

function show_status_query(eventNotUsed) {
  if (! shibselectedquery)
    return;
  if (! engineInfo || !engineInfo.monitor[shibselectedquery.engine])
    return;
  show_status_dialog(shibselectedquery);
}

function delete_query(event) {
  if (! shibselectedquery)
    return;
  var target = shibselectedquery;
  authAjax({
    url: '/delete',
    type: 'POST',
    dataType: 'json',
    data: {queryid: target.queryid},
    error: function(jqXHR, textStatus, err){
      console.log(jqXHR);
      console.log(textStatus);
      var msg = null;
      try {
        msg = JSON.parse(jqXHR.responseText).message;
      }
      catch (e) {
        msg = jqXHR.responseText;
      }
      show_error('Failed to delete query', msg);
    },
    success: function(data){
      show_info('Selected query successfully deleted', '');
      initiate_mainview(null, true);
      delete_execute_query_item(target.queryid);
      load_tabs({reload:true});
    }
  });
};

function show_result_query(opts) { /* opts: {range:full/head} */
  var size = 'full';
  var height = 400;
  var width = 600;
  if (opts.range == 'head'){
    size = 'head';
    height = 200;
  }
  authGetText('/show/' + size + '/' + query_last_done_result(shibselectedquery).resultid, function(data){
    $('pre#resultdisplay').text(data);
    $('#resultdiag').dialog({modal:true, resizable:true, height:400, width:600, maxHeight:650, maxWidth:950});
  });
};

function download_result_query(opts) { /* opts: {format:tsv/csv} */
  var format = 'tsv';
  if (opts.format == 'csv') {
    format = 'csv';
  }
  window.location = '/download/' + format + '/' + query_last_done_result(shibselectedquery).resultid;
};
