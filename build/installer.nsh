/*
 * Garde-fou d'architecture pour l'installateur NSIS.
 *
 * electron-builder choisit l'archive à extraire dans `identify_package`
 * (app-builder-lib/templates/nsis/include/extractAppPackage.nsh) :
 *
 *     !ifdef APP_ARM64
 *       ${if} ${IsNativeARM64}
 *         StrCpy $packageArch "ARM64"
 *       ${endif}
 *     !endif
 *
 * Quand aucune branche ne correspond à la machine, `$packageArch` reste
 * **vide**. `compute_files_for_current_arch` tombe alors dans son cas par
 * défaut, n'embarque aucune archive, et `extractUsing7za` travaille sur un
 * fichier inexistant — sans lever d'erreur. L'installateur poursuit son
 * chemin : il écrit son désinstalleur, crée les raccourcis, annonce une
 * réussite, et laisse un dossier d'installation qui ne contient que
 * `Uninstall Audii.exe`. Le raccourci pointe sur un exécutable qui n'a
 * jamais été extrait.
 *
 * Concrètement : lancer l'installateur ARM64 sur un PC x64 « réussit » et
 * n'installe rien. C'est le pire des comportements — un échec déguisé en
 * succès. On refuse donc explicitement, en disant quel fichier prendre.
 *
 * `customInit` est appelé depuis `.onInit`, avant toute écriture : `Quit`
 * y annule proprement l'installation.
 */

!macro customInit
  # Paquet ARM64 seul : il ne s'installe que sur une machine ARM64 native.
  !ifndef APP_64
  !ifndef APP_32
  !ifdef APP_ARM64
    ${IfNot} ${IsNativeARM64}
      MessageBox MB_OK|MB_ICONSTOP "Cette version d'Audii est réservée aux processeurs ARM64, et ce PC n'en est pas équipé.$\r$\n$\r$\nTéléchargez « Audii-Setup-x64.exe » à la place." /SD IDOK
      SetErrorLevel 1
      Quit
    ${EndIf}
  !endif
  !endif
  !endif

  # Paquet x64 seul : Windows 64 bits, ou ARM64 via son émulation x64.
  !ifndef APP_ARM64
  !ifndef APP_32
  !ifdef APP_64
    ${IfNot} ${RunningX64}
    ${AndIfNot} ${IsNativeARM64}
      MessageBox MB_OK|MB_ICONSTOP "Cette version d'Audii demande un Windows 64 bits, et ce PC est en 32 bits.$\r$\n$\r$\nAudii n'est pas encore distribué pour cette architecture." /SD IDOK
      SetErrorLevel 1
      Quit
    ${EndIf}
  !endif
  !endif
  !endif
!macroend
