<?php
// ------------------------------------------------------------------------------------------------
// SHARED PAIR STORE
// Server side of resources/pair_sync.js. Keeps one JSON file per pair in sync/state/
// (sync/state_test/ for test runs), e.g. sync/state/pair_12.json:
//   { "naive":       { "phase1_label_c1": {"value": "Kreuzhahn", "t": 1760000000123}, ... },
//     "confederate": { "phase1_label_c1": {"value": "Ventil",    "t": 1760000000456}, ... } }
//
// Actions, chosen by $_POST['action']:
//   'get'  - pair: return the whole JSON file, so a browser can read its partner's values
//   'set'  - pair, role, key, value: store the value (JSON) under this role, with the server time
//   'join' - pair, role, value: delete everything stored for this role and store value as 'joined'
//            (start of a session, see PairSync.connect)
// local_server.py implements exactly the same actions for running without PHP - keep both in sync.
// The folders sync/state and sync/state_test must be writable by the server, like data/.
// ------------------------------------------------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(array('error' => $msg));
    exit;
}

$action = isset($_POST['action']) ? $_POST['action'] : '';
$pair = isset($_POST['pair']) ? $_POST['pair'] : '';
$role = isset($_POST['role']) ? $_POST['role'] : '';
$dir = (isset($_POST['test']) && $_POST['test'] === '1') ? __DIR__ . '/state_test' : __DIR__ . '/state';

// the values become file names / JSON keys, so only accept what the experiment uses
if (!preg_match('/^[0-9]{1,6}$/', $pair)) fail(400, 'bad pair');
if (!in_array($action, array('get', 'set', 'join'), true)) fail(400, 'bad action');
if ($action !== 'get' && !in_array($role, array('naive', 'confederate'), true)) fail(400, 'bad role');

$fp = fopen($dir . '/pair_' . $pair . '.json', 'c+');
if ($fp === false) fail(500, 'cannot open state file');
// both browsers may write at the same moment
flock($fp, $action === 'get' ? LOCK_SH : LOCK_EX);
$raw = stream_get_contents($fp);
$state = $raw ? json_decode($raw, true) : array();
if (!is_array($state)) $state = array();

if ($action !== 'get') {
    $value = isset($_POST['value']) ? json_decode($_POST['value'], true) : null;
    $entry = array('value' => $value, 't' => (int) round(microtime(true) * 1000));
    if ($action === 'join') {
        $state[$role] = array('joined' => $entry);
    } else {
        $key = isset($_POST['key']) ? $_POST['key'] : '';
        if (!preg_match('/^[A-Za-z0-9_]{1,80}$/', $key)) {
            flock($fp, LOCK_UN);
            fclose($fp);
            fail(400, 'bad key');
        }
        if (!isset($state[$role]) || !is_array($state[$role])) $state[$role] = array();
        $state[$role][$key] = $entry;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fp);
}
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode((object) $state, JSON_UNESCAPED_UNICODE);
?>
