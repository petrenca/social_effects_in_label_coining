<?php
// Test-run version of save_data.php: saves into data_test/ and only accepts
// TEST_social_<pairID>_<role>_<timestamp>.csv, so test runs never mix with real data.
$name = isset($_POST['filename']) ? basename($_POST['filename']) : "";
if (!preg_match('/^TEST_social_[0-9]+_(naive|confederate)_[0-9]+\.csv$/', $name) || !isset($_POST['filedata'])) {
    http_response_code(400);
    exit;
}
if (file_put_contents("data_test/" . $name, $_POST['filedata'], LOCK_EX) === false) {
    http_response_code(500);
    exit;
}
echo "ok";
?>
