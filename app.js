require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
const mongoose = require('mongoose');

const EXPORT_FILE_PATH = path.join(__dirname, 'export.txt');
const BACKUPS_DIR = path.join(__dirname, 'backups');

const menuOptions = [
    { key: '1', label: 'Add Record', action: addRecord },
    { key: '2', label: 'Update Record', action: updateRecord },
    { key: '3', label: 'Delete Record', action: deleteRecord },
    { key: '4', label: 'List All Records', action: listRecords },
    { key: '5', label: 'Search Records', action: searchRecords },
    { key: '6', label: 'Sort Records', action: sortRecords },
    { key: '7', label: 'Export Data', action: exportData },
    { key: '8', label: 'View Vault Statistics', action: viewVaultStatistics },
    { key: '0', label: 'Exit', action: exitApp }
];

const recordSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        details: { type: String, trim: true }
    },
    { timestamps: true }
);

const Record = mongoose.model('Record', recordSchema);

async function connectToDatabase() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is missing in .env. Please set it before running the app.');
        process.exit(1);
    }

    const options = {
        serverSelectionTimeoutMS: 5000
    };

    if (process.env.MONGO_CERT_PATH) {
        options.tls = true;
        options.tlsCertificateKeyFile = path.resolve(process.env.MONGO_CERT_PATH);
    }

    try {
        await mongoose.connect(uri, options);
        console.log('Connected to MongoDB.');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        process.exit(1);
    }
}

async function ensureBackupsDir() {
    await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
}

function promptMenu() {
    console.log('\n==== Vault Menu ====');
    menuOptions.forEach(option => console.log(`${option.key}. ${option.label}`));
    return readlineSync.question('Select an option: ').trim();
}

function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
}

function displayRecords(records) {
    records.forEach((record, index) => {
        console.log(`\n#${index + 1}`);
        console.log(`ID: ${record._id}`);
        console.log(`Name: ${record.name}`);
        console.log(`Details: ${record.details || 'N/A'}`);
        console.log(`Created: ${formatDate(record.createdAt)}`);
        console.log(`Updated: ${formatDate(record.updatedAt)}`);
    });
}

async function addRecord() {
    const name = readlineSync.question('Enter record name: ').trim();
    if (!name) {
        console.log('Name is required. Aborting add operation.');
        return;
    }

    const details = readlineSync.question('Enter record details (optional): ').trim();
    const newRecord = await Record.create({ name, details });
    console.log('\nRecord added successfully:');
    displayRecords([newRecord]);
    await createBackup();
}

async function updateRecord() {
    const id = readlineSync.question('Enter record ID to update: ').trim();
    if (!mongoose.isValidObjectId(id)) {
        console.log('Invalid ID format.');
        return;
    }

    const record = await Record.findById(id);
    if (!record) {
        console.log('Record not found.');
        return;
    }

    const name = readlineSync.question(`Enter new name (${record.name}): `).trim();
    if (name) record.name = name;

    const details = readlineSync.question(`Enter new details (${record.details || 'N/A'}): `).trim();
    if (details) record.details = details;

    await record.save();
    console.log('\nRecord updated successfully:');
    displayRecords([record]);
}

async function deleteRecord() {
    const id = readlineSync.question('Enter record ID to delete: ').trim();
    if (!mongoose.isValidObjectId(id)) {
        console.log('Invalid ID format.');
        return;
    }

    const confirmation = readlineSync.question('Are you sure you want to delete this record? (y/N): ').trim().toLowerCase();
    if (confirmation !== 'y') {
        console.log('Delete operation cancelled.');
        return;
    }

    const deletedRecord = await Record.findByIdAndDelete(id);
    if (!deletedRecord) {
        console.log('Record not found.');
        return;
    }

    console.log('Record deleted successfully.');
    await createBackup();
}

async function listRecords() {
    const records = await Record.find().sort({ createdAt: 1 });
    if (!records.length) {
        console.log('No records available.');
        return;
    }

    console.log('\nAll Records:');
    displayRecords(records);
}

async function searchRecords() {
    console.log('\nSearch by:\n1. Name\n2. ID');
    const choice = readlineSync.question('Select an option: ').trim();
    let records = [];

    if (choice === '1') {
        const name = readlineSync.question('Enter name to search: ').trim();
        if (!name) {
            console.log('Search term is required.');
            return;
        }
        records = await Record.find({ name: { $regex: name, $options: 'i' } }).sort({ createdAt: 1 });
    } else if (choice === '2') {
        const id = readlineSync.question('Enter ID to search: ').trim();
        if (!id) {
            console.log('ID is required.');
            return;
        }
        if (mongoose.isValidObjectId(id)) {
            const record = await Record.findById(id);
            if (record) records = [record];
        } else {
            console.log('Invalid ID format.');
            return;
        }
    } else {
        console.log('Invalid choice.');
        return;
    }

    if (!records.length) {
        console.log('No records found.');
        return;
    }

    console.log('\nSearch Results:');
    displayRecords(records);
}

async function sortRecords() {
    console.log('\nSort by:\n1. Name\n2. Creation Date');
    const fieldChoice = readlineSync.question('Select an option: ').trim();
    let sortField;
    if (fieldChoice === '1') {
        sortField = 'name';
    } else if (fieldChoice === '2') {
        sortField = 'createdAt';
    } else {
        console.log('Invalid selection.');
        return;
    }

    console.log('\nOrder:\n1. Ascending\n2. Descending');
    const orderChoice = readlineSync.question('Select an option: ').trim();
    let sortOrder;
    if (orderChoice === '1') {
        sortOrder = 1;
    } else if (orderChoice === '2') {
        sortOrder = -1;
    } else {
        console.log('Invalid selection.');
        return;
    }

    const records = await Record.find().sort({ [sortField]: sortOrder });
    if (!records.length) {
        console.log('No records to sort.');
        return;
    }

    console.log('\nSorted Records:');
    displayRecords(records);
}

async function exportData() {
    const records = await Record.find().sort({ createdAt: 1 });
    const header = [
        `Export Timestamp: ${formatDate(new Date())}`,
        `Total Records: ${records.length}`,
        `File: ${path.basename(EXPORT_FILE_PATH)}`,
        '------------------------------'
    ];

    const lines = records.flatMap((record, index) => [
        `#${index + 1}`,
        `ID: ${record._id}`,
        `Name: ${record.name}`,
        `Details: ${record.details || 'N/A'}`,
        `Created: ${formatDate(record.createdAt)}`,
        `Updated: ${formatDate(record.updatedAt)}`,
        ''
    ]);

    await fs.promises.writeFile(EXPORT_FILE_PATH, `${header.join('\n')}\n\n${lines.join('\n')}`, 'utf8');
    console.log('Data exported successfully to export.txt.');
}

async function createBackup() {
    const records = await Record.find().sort({ createdAt: 1 }).lean();
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    const filename = `backup_${timestamp}.json`;
    const filePath = path.join(BACKUPS_DIR, filename);
    await fs.promises.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`Backup created: ${filename}`);
}

async function viewVaultStatistics() {
    const totalRecords = await Record.countDocuments();
    const lastModifiedRecord = await Record.findOne().sort({ updatedAt: -1 });
    const earliestRecord = await Record.findOne().sort({ createdAt: 1 });
    const latestRecord = await Record.findOne().sort({ createdAt: -1 });

    const longestNameResult = await Record.aggregate([
        {
            $project: {
                name: 1,
                createdAt: 1,
                length: { $strLenCP: '$name' }
            }
        },
        { $sort: { length: -1 } },
        { $limit: 1 }
    ]);

    const longestName = longestNameResult[0]?.name || 'N/A';
    const longestNameLength = longestNameResult[0]?.length || 0;

    console.log('\n==== Vault Statistics ====');
    console.log(`Total Records: ${totalRecords}`);
    console.log(`Last Modification: ${lastModifiedRecord ? formatDate(lastModifiedRecord.updatedAt) : 'N/A'}`);
    console.log(`Longest Name: ${longestName} (${longestNameLength} characters)`);
    console.log(`Earliest Record Date: ${earliestRecord ? formatDate(earliestRecord.createdAt) : 'N/A'}`);
    console.log(`Latest Record Date: ${latestRecord ? formatDate(latestRecord.createdAt) : 'N/A'}`);
}

async function exitApp() {
    console.log('Exiting application...');
    await mongoose.connection.close();
    process.exit(0);
}

async function main() {
    await connectToDatabase();
    await ensureBackupsDir();

    while (true) {
        const choice = promptMenu();
        const selectedOption = menuOptions.find(option => option.key === choice);

        if (!selectedOption) {
            console.log('Invalid selection. Please try again.');
            continue;
        }

        try {
            await selectedOption.action();
        } catch (error) {
            console.error('An error occurred:', error.message);
        }

        readlineSync.question('\nPress Enter to return to menu...');
    }
}

process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    await mongoose.connection.close();
    process.exit(0);
});

main();
