"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOPICS_SEED = void 0;
var anat_json_1 = require("../../../assets/syllabus/topics/anat.json");
var phys_json_1 = require("../../../assets/syllabus/topics/phys.json");
var bioc_json_1 = require("../../../assets/syllabus/topics/bioc.json");
var path_json_1 = require("../../../assets/syllabus/topics/path.json");
var micr_json_1 = require("../../../assets/syllabus/topics/micr.json");
var phar_json_1 = require("../../../assets/syllabus/topics/phar.json");
var med_json_1 = require("../../../assets/syllabus/topics/med.json");
var fmt_json_1 = require("../../../assets/syllabus/topics/fmt.json");
var surg_json_1 = require("../../../assets/syllabus/topics/surg.json");
var obg_json_1 = require("../../../assets/syllabus/topics/obg.json");
var peds_json_1 = require("../../../assets/syllabus/topics/peds.json");
var orth_json_1 = require("../../../assets/syllabus/topics/orth.json");
var opth_json_1 = require("../../../assets/syllabus/topics/opth.json");
var ent_json_1 = require("../../../assets/syllabus/topics/ent.json");
var psy_json_1 = require("../../../assets/syllabus/topics/psy.json");
var derm_json_1 = require("../../../assets/syllabus/topics/derm.json");
var radi_json_1 = require("../../../assets/syllabus/topics/radi.json");
var anes_json_1 = require("../../../assets/syllabus/topics/anes.json");
var psm_json_1 = require("../../../assets/syllabus/topics/psm.json");
// Order matches `assets/syllabus/manifest.json#subjectOrder` and the
// original in-file emission order of the legacy `syllabus.ts` monolith.
exports.TOPICS_SEED = [].concat(anat_json_1.default, phys_json_1.default, bioc_json_1.default, path_json_1.default, micr_json_1.default, phar_json_1.default, med_json_1.default, fmt_json_1.default, surg_json_1.default, obg_json_1.default, peds_json_1.default, orth_json_1.default, opth_json_1.default, ent_json_1.default, psy_json_1.default, derm_json_1.default, radi_json_1.default, anes_json_1.default, psm_json_1.default);
