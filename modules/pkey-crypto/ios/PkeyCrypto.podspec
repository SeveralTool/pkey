require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PkeyCrypto'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/severaltool/pkey.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,c,swift}'
  s.public_header_files = 'Argon2Bridge.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_OBJC_BRIDGING_HEADER' => '$(PODS_TARGET_SRCROOT)/PkeyCrypto-Bridging-Header.h',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ARGON2_NO_THREADS=1',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/argon2/include" "$(PODS_TARGET_SRCROOT)/argon2/src" "$(PODS_TARGET_SRCROOT)/argon2/src/blake2"'
  }
end
