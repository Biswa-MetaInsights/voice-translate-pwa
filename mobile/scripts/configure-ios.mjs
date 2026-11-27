import xcode from 'xcode';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url));
const project = xcode.project(file); project.parseSync();
const targets = project.pbxNativeTargetSection();
const app = project.getFirstTarget();
let target = Object.entries(targets).find(([key, value]) => !key.endsWith('_comment') && value.name?.replaceAll('"', '') === 'VoiceNoteShare');
if (!target) {
  if (!project.pbxGroupByName('Resources')) {
    const resources = project.addPbxGroup([], 'Resources');
    project.addToPbxGroup(resources.uuid, project.getFirstProject().firstProject.mainGroup);
  }
  const added = project.addTarget('VoiceNoteShare', 'app_extension', 'VoiceNoteShare', 'eu.voicetranslator.app.VoiceNoteShare');
  target = [added.uuid, added.pbxNativeTarget];
  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', added.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', added.uuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', added.uuid);
  const group = project.addPbxGroup([], 'VoiceNoteShare');
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
  for (const name of ['ShareViewController.swift', 'VoiceNoteAPI.swift']) project.addSourceFile('VoiceNoteShare/' + name, { target: added.uuid }, group.uuid);
  for (const name of ['Backend.plist', 'PrivacyInfo.xcprivacy']) project.addResourceFile('VoiceNoteShare/' + name, { target: added.uuid }, group.uuid);
  project.addFile('VoiceNoteShare/Info.plist', group.uuid);
  project.addResourceFile('App/PrivacyInfo.xcprivacy', { target: app.uuid }, project.getFirstProject().firstProject.mainGroup);
}
const list = project.pbxXCConfigurationList()[target[1].buildConfigurationList];
const configs = project.pbxXCBuildConfigurationSection();
for (const entry of list.buildConfigurations) {
  Object.assign(configs[entry.value].buildSettings, {
    INFOPLIST_FILE: '"VoiceNoteShare/Info.plist"', PRODUCT_BUNDLE_IDENTIFIER: '"eu.voicetranslator.app.VoiceNoteShare"',
    APPLICATION_EXTENSION_API_ONLY: 'YES', IPHONEOS_DEPLOYMENT_TARGET: '18.0', SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '"1,2"', CODE_SIGN_STYLE: 'Automatic', CURRENT_PROJECT_VERSION: '1', MARKETING_VERSION: '0.1.0',
    GENERATE_INFOPLIST_FILE: 'NO', SKIP_INSTALL: 'YES', SWIFT_EMIT_LOC_STRINGS: 'YES',
  });
}
for (const [key, config] of Object.entries(configs)) {
  if (key.endsWith('_comment')) continue;
  if (config.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET) config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '18.0';
  if (config.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER?.replaceAll('"', '') === 'eu.voicetranslator.app') {
    config.buildSettings.MARKETING_VERSION = '0.1.0'; config.buildSettings.CURRENT_PROJECT_VERSION = '1';
  }
}
function clean(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) { if (value[key] === undefined) delete value[key]; else clean(value[key]); }
}
clean(project.hash);
for (const value of Object.values(project.hash.project.objects.PBXFileReference)) {
  if (typeof value === 'object' && value.path?.includes('xcprivacy')) value.lastKnownFileType = 'text.xml';
}
writeFileSync(file, project.writeSync());
// Validate that the extension is genuinely an embedded target, not loose Swift files.
const check = readFileSync(file, 'utf8');
if (!check.includes('com.apple.product-type.app-extension') || !check.includes('VoiceNoteShare.appex')) throw new Error('Share Extension target was not embedded.');
console.log('Configured embedded iOS Share Extension. Signing and Xcode compilation remain required.');
