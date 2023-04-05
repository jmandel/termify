#!/bin/bash

# Input file
input_file="Terminology/sct2_Description_Snapshot-en_US1000124_20230301.txt"


# Output SQLite3 database file
db_file="output.db"
rm output.db

# Create the database file and schema
sqlite3 "$db_file" <<EOF
CREATE TABLE IF NOT EXISTS terminology (
    id INTEGER,
    effectiveTime TEXT,
    active INTEGER,
    moduleId INTEGER,
    conceptId INTEGER,
    languageCode TEXT,
    typeId INTEGER,
    term TEXT,
    caseSignificanceId INTEGER
);

CREATE VIEW IF NOT EXISTS terminology_view AS
SELECT rowid, conceptId AS code, term AS display
FROM terminology;

-- Create FTS5 virtual tables
CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5(code, display, content='terminology_view', tokenize='porter');
EOF

# Import the data from the input file to the database
{
  echo ".mode ascii"
  echo ".separator \"\t\" \"\n\""
  echo ".import '$input_file' terminology"
} | sqlite3 "$db_file"

# Populate the virtual tables with data from the main table
sqlite3 "$db_file" <<EOF
DELETE from terminology where NOT (term LIKE '%(disorder)%' or term LIKE '%(procedure)%' or term LIKE '%(finding)%');

INSERT INTO vocab (rowid, code, display)
SELECT rowid, code, display FROM terminology_view;

EOF

echo "Data imported to $db_file"
