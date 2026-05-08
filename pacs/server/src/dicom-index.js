'use strict';

const fs = require('fs');
const path = require('path');
const { STUDIES } = require('./seed-data');

// Demo patient pool — applied to real DICOM files so the viewer shows
// realistic names instead of anonymised test-data labels like "MisterMr".
const DEMO_PATIENTS = [
  { patientName: 'SMITH^JOHN^A',        patientID: 'PAT001', patientBirthDate: '19650415', patientSex: 'M', assignedTo: 'dr.chen@careconnect.demo',  priority: 'STAT'    },
  { patientName: 'JOHNSON^MARY^E',      patientID: 'PAT002', patientBirthDate: '19780923', patientSex: 'F', assignedTo: 'dr.chen@careconnect.demo',  priority: 'ROUTINE' },
  { patientName: 'DAVIS^ROBERT^C',      patientID: 'PAT003', patientBirthDate: '19551112', patientSex: 'M', assignedTo: 'dr.patel@careconnect.demo', priority: 'URGENT'  },
  { patientName: 'WILSON^PATRICIA^M',   patientID: 'PAT004', patientBirthDate: '19710308', patientSex: 'F', assignedTo: 'dr.chen@careconnect.demo',  priority: 'ROUTINE' },
  { patientName: 'MARTINEZ^JENNIFER^L', patientID: 'PAT005', patientBirthDate: '19681225', patientSex: 'F', assignedTo: 'dr.patel@careconnect.demo', priority: 'STAT'    },
  { patientName: 'ANDERSON^WILLIAM^T',  patientID: 'PAT006', patientBirthDate: '19430702', patientSex: 'M', assignedTo: 'dr.chen@careconnect.demo',  priority: 'URGENT'  },
  { patientName: 'TAYLOR^LINDA^S',      patientID: 'PAT007', patientBirthDate: '19820519', patientSex: 'F', assignedTo: 'dr.patel@careconnect.demo', priority: 'ROUTINE' },
  { patientName: 'THOMAS^JAMES^R',      patientID: 'PAT008', patientBirthDate: '19591030', patientSex: 'M', assignedTo: 'dr.chen@careconnect.demo',  priority: 'STAT'    },
];

// Stable hash so the same DICOM study always maps to the same demo patient.
function uidToPatient(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return DEMO_PATIENTS[h % DEMO_PATIENTS.length];
}

// UID → absolute file path
const instanceFileMap = new Map();
// studyUID → study object
const studyMap = new Map();
// ordered list for worklist
let allStudies = [];

function loadSeedData() {
  allStudies = STUDIES.map(s => ({ ...s }));
  for (const study of allStudies) {
    studyMap.set(study.studyInstanceUID, study);
  }
  console.log(`[dicom-index] No DICOM files found — loaded ${allStudies.length} seed studies`);
}

async function buildIndex(studiesDir) {
  if (!fs.existsSync(studiesDir)) {
    console.log(`[dicom-index] Studies directory not found: ${studiesDir}`);
    loadSeedData();
    return;
  }

  const dcmFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.toLowerCase().endsWith('.dcm')) dcmFiles.push(p);
    }
  }
  walk(studiesDir);

  if (dcmFiles.length === 0) {
    loadSeedData();
    return;
  }

  console.log(`[dicom-index] Scanning ${dcmFiles.length} DICOM files...`);

  let dcmjs;
  try {
    dcmjs = require('dcmjs');
  } catch {
    console.warn('[dicom-index] dcmjs unavailable — serving files by filename only');
    loadSeedData();
    return;
  }

  // studyUID → { study object with series as Map }
  const parsedStudies = new Map();

  for (const filePath of dcmFiles) {
    try {
      const buf = fs.readFileSync(filePath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

      const studyUID = ds.StudyInstanceUID;
      const seriesUID = ds.SeriesInstanceUID;
      const instanceUID = ds.SOPInstanceUID;
      if (!studyUID || !seriesUID || !instanceUID) continue;

      if (!parsedStudies.has(studyUID)) {
        const demo = uidToPatient(studyUID);
        parsedStudies.set(studyUID, {
          studyInstanceUID: studyUID,
          patientName: demo.patientName,
          patientID: demo.patientID,
          patientBirthDate: demo.patientBirthDate,
          patientSex: demo.patientSex,
          studyDate: ds.StudyDate || '',
          studyTime: ds.StudyTime || '',
          studyDescription: ds.StudyDescription || 'UNKNOWN STUDY',
          modality: ds.Modality || 'OT',
          accessionNumber: ds.AccessionNumber || '',
          numberOfImages: 0,
          priority: demo.priority,
          status: 'UNREAD',
          assignedTo: demo.assignedTo,
          referringPhysician: 'JONES^MICHAEL^R',
          institution: 'Memorial General Hospital',
          hasImages: true,
          seriesMap: new Map(),
        });
      }

      const study = parsedStudies.get(studyUID);

      if (!study.seriesMap.has(seriesUID)) {
        study.seriesMap.set(seriesUID, {
          seriesInstanceUID: seriesUID,
          seriesNumber: String(ds.SeriesNumber ?? '1'),
          seriesDescription: ds.SeriesDescription || `Series ${ds.SeriesNumber ?? 1}`,
          modality: ds.Modality || 'OT',
          numberOfInstances: 0,
          instances: [],
        });
      }

      const series = study.seriesMap.get(seriesUID);
      series.instances.push({
        sopInstanceUID: instanceUID,
        instanceNumber: parseInt(ds.InstanceNumber ?? series.instances.length + 1, 10),
      });
      series.numberOfInstances = series.instances.length;
      study.numberOfImages++;
      instanceFileMap.set(instanceUID, filePath);
    } catch (err) {
      console.warn(`[dicom-index] Skipping ${path.basename(filePath)}: ${err.message}`);
    }
  }

  // Flatten seriesMap → series array
  for (const [uid, study] of parsedStudies) {
    const finalStudy = {
      ...study,
      series: Array.from(study.seriesMap.values())
        .map(s => ({ ...s, instances: [...s.instances].sort((a, b) => a.instanceNumber - b.instanceNumber) }))
        .sort((a, b) => parseInt(a.seriesNumber, 10) - parseInt(b.seriesNumber, 10)),
    };
    delete finalStudy.seriesMap;
    studyMap.set(uid, finalStudy);
    allStudies.push(finalStudy);
  }

  // Build modality → [filePath, ...] index from real parsed files
  const realFilesByModality = new Map();
  for (const [, study] of parsedStudies) {
    const mod = study.modality;
    if (!realFilesByModality.has(mod)) realFilesByModality.set(mod, []);
    for (const ser of study.seriesMap.values()) {
      for (const inst of ser.instances) {
        const fp = instanceFileMap.get(inst.sopInstanceUID);
        if (fp) realFilesByModality.get(mod).push(fp);
      }
    }
  }

  // Add seed studies not covered by real file UIDs.
  // If real files of the same modality exist, bridge every seed instance UID to a real
  // file so the viewer renders actual DICOM images instead of the demo-metadata overlay.
  for (const seed of STUDIES) {
    if (studyMap.has(seed.studyInstanceUID)) continue;

    const realFiles = realFilesByModality.get(seed.modality) || [];
    if (realFiles.length > 0) {
      let fi = 0;
      for (const series of seed.series) {
        for (const inst of series.instances) {
          instanceFileMap.set(inst.sopInstanceUID, realFiles[fi % realFiles.length]);
          fi++;
        }
      }
      const bridged = { ...seed, hasImages: true };
      studyMap.set(bridged.studyInstanceUID, bridged);
      allStudies.push(bridged);
    } else {
      studyMap.set(seed.studyInstanceUID, seed);
      allStudies.push(seed);
    }
  }

  const real = parsedStudies.size;
  console.log(`[dicom-index] Index ready: ${real} real + ${allStudies.length - real} seed studies, ${instanceFileMap.size} images`);
}

const getStudies = () => allStudies;
const getStudy = (uid) => studyMap.get(uid) ?? null;
const getInstanceFilePath = (uid) => instanceFileMap.get(uid) ?? null;

module.exports = { buildIndex, getStudies, getStudy, getInstanceFilePath };
