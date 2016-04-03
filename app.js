var request = require('request');
var createDownload = require('mt-downloader').createDownload;
var path = require('path');
var http = require('http');
var fs = require('fs');
var Datastore = require('nedb');

var CONFIG = {
	LIST: 'http://www.mangaeden.com/en/en-directory/',
	BASE: 'http://www.mangaeden.com'
};
var db = new Datastore({ filename: 'simpan.db', autoload: true });

var $image_loading = $('#image-loading');
var $select_manga = $('#select-manga');
var $select_chapter = $('#select-chapter');
var $input_directory = $('#input-directory');
var $button_download = $('#button-download');
var $button_clear_completed = $('#button-clear-completed');
var $download_status = $('#download-status');
var $text_debug = $('#text-debug');

String.prototype.padZero = function(len, c) {
	var s = this, c = c || '0';
	while (s.length< len) s = c+ s;
	return s;
}

function init() {
	$select_manga.on('change', function () {
		if (this.value) on_manga_chosen();
	});
	$select_chapter.on('change', function () {
		if (this.value) on_chapter_chosen();
	});
	$button_download.on('click', function () {
		on_download_start();
	});
	$button_clear_completed.on('click', function () {
		on_clear_completed();
	});
}

function reset() {
	$image_loading.hide();
	$select_manga.hide();
	$select_manga.html('');
	$select_chapter.hide();
	$select_chapter.html('');
	$input_directory.hide();
	$button_download.hide();
	$button_clear_completed.hide();
	$download_status.html('');
}

function show_loading(text, $el) {
	$el.after($image_loading);
	$el.hide();
	$image_loading.find('div').html(text);
	$image_loading.show();
}

function hide_loading() {
	$image_loading.hide();
}

function on_manga_chosen(msg) {
	var url = $select_manga.val();
	msg = msg || 'Loading Chapter List';
	$select_chapter.chosen('destroy');
	$select_chapter.html('');
	show_loading(msg, $select_chapter);

	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			hide_loading();
			var $links = $(body).find('.chapterLink');

			$select_chapter.append('<option value="">-- Choose Chapter --</option>');
			$links.each(function () {
				var $this = $(this);
				var $option = $('<option>', {'value': CONFIG.BASE + $this.attr('href')});
				$option.html($this.find('b').text());
				$select_chapter.append($option);
			});

			$select_chapter.show();
			$select_chapter.chosen();
		} else {
			on_manga_chosen('Retrying...');
		}
	});
}

function on_chapter_chosen() {
	$input_directory.show();
	$button_download.show();
	$button_clear_completed.show();
}

function on_download_start(msg) {
	if (!$input_directory.val()) return;

	var url = $select_chapter.val();
	msg = msg || 'Loading Images';
	show_loading(msg, $button_download);

	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var match = $(body).find('#pageInfo').text().match(/ of (\d+)/);
			var n = match[1];

			var pages = [];
			for (var i=1; i<=n; i++) {
				pages.push(url.replace(/\/1\/$/, '/'+i+'/'));
			}
			step_download_images(pages);

			hide_loading();
			$button_download.show();
		} else {
			on_download_start('Retrying...')
		}
	});
}

function step_download_images(pages) {
	// show_loading('Loading Image URLs', $download_status);

	for (var i=0; i<pages.length; i++) {
		(function (i) {
			request(pages[i], function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var src = $(body).find('#mainImg').attr('src');
					var ext = src.match(/\.(\w+)$/)[1];
					var filename = (""+i).padZero(3) + '.' + ext;
					var output = $input_directory.val() + path.sep + filename;

					download_and_show(src, output);
				}
			});
		}(i));
	}
}

function download_file(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  var request = http.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close(cb);  // close() is async, call cb after close completes.
    });
  }).on('error', function(err) { // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    if (cb) cb(err.message);
  });
}

function download_and_show(url, output) {
	if (!url.match(/^http:/)) url = 'http:' + url;
	if (url.match(/(\/\d{4}x\/)/)) url = url.replace(/(\/\d{4}x\/)/, '/');

	var $status = $('<p>');
	$status.html('<div class="my-label">Downloading</div>'+
		'<div class="progress">'+
			'<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%">'+
			'</div>'+
		'</div>');
	var $label = $status.find('.my-label');
	var $progress = $status.find('.progress-bar');
	$label.html('Downloading '+ output);
	// $text_debug.append(url+"\n");

	$download_status.append($status);

	download_file(url, output, function (error) {
		if (!error) {
			$label.html('Finished downloading '+output);
			$progress.removeClass('progress-bar-striped active').addClass('progress-bar-success');
		}
	});
}

function on_clear_completed() {
	$download_status.find('.progress-bar-success').parent().parent().remove();
}

function download_manga_list() {
	var the_list = {};

	download_manga_list_from_page(1, 100, the_list, function () {
		db.insert({ name: 'manga-list', the_list: JSON.stringify(the_list) });
		show_manga_list(the_list);
	});
}

function download_manga_list_from_page(i, n, the_list, cb) {
	if (i > n) {
		cb();
	} else {
		show_loading('Parsing Manga List, page ' + i, $select_manga);
		var url = CONFIG.LIST + '?page=' + i;
		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var $links = $(body).find('.closedManga, .openManga');
				$links.each(function () {
					var $this = $(this);
					the_list[CONFIG.BASE + $this.attr('href')] = $this.text();
				});
				download_manga_list_from_page(i+1, n, the_list, cb);
			} else {
				download_manga_list_from_page(i, n, the_list, cb);
			}
		});
	}
}

function show_manga_list(the_list) {
	$select_manga.append('<option value="">-- Choose Manga --</option>');
	for (var url in the_list) {
		if (the_list.hasOwnProperty(url)) {
			var $option = $('<option>', {'value': url});
			$option.html(the_list[url]);
			$select_manga.append($option);
		}
	}
	hide_loading();
	$select_manga.show();
	$select_manga.chosen();
}


// Main Program:
init();
reset();
show_loading('Initializing...', $select_manga);
db.findOne({name: 'manga-list'}, function (err, doc) {
	if (!doc) {
		download_manga_list();
	} else {
		show_manga_list(JSON.parse(doc.the_list));
	}
});
