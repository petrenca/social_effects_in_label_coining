<?php
// Saves one participant's data file into data/ (must be writable by the server).
// Only file names of the form social_<pairID>_<role>_<timestamp>.csv are accepted, so nobody can
// use this script to write other files (e.g. "../something.php") onto the server. The same file
// name is saved again after every phase (overwritten), so a crash does not lose earlier phases.
// TODO (when the ID queue is added, see README): remove the pair ID from ID_management/IDs_social.txt
// once the naive participant's final file is written, as in Exp2's save_data.php.
$name = isset($_POST['filename']) ? basename($_POST['filename']) : "";
if (!preg_match('/^social_[0-9]+_(naive|confederate)_[0-9]+\.csv$/', $name) || !isset($_POST['filedata'])) {
    http_response_code(400);
    exit;
}
if (file_put_contents("data/" . $name, $_POST['filedata'], LOCK_EX) === false) {
    http_response_code(500);
    exit;
}
echo "ok";
?>
