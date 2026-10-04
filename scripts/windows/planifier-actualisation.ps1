# Solution de repli SANS GitHub : tâche planifiée Windows hebdomadaire (lundi 7 h 30) qui lance
# `npm run data:update` dans ce dossier. Limites : le PC doit être allumé ; pas d'issue d'alerte (lire
# out\refresh-report.md) ; pas d'historique Git. GitHub Actions reste la solution recommandée.
#
# NON EXÉCUTÉ automatiquement. Pour l'installer, ouvrir PowerShell dans ce dossier et lancer :
#   powershell -ExecutionPolicy Bypass -File scripts\windows\planifier-actualisation.ps1
# Pour la retirer :
#   Unregister-ScheduledTask -TaskName "Emeraude - actualisation des donnees" -Confirm:$false

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$npm`" run data:update > out\derniere-execution.log 2>&1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:30am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'Emeraude - actualisation des donnees' -Action $action -Trigger $trigger -Settings $settings -Description 'Actualisation controlee des donnees publiques (Eurostat, Insee) de l''estimateur Emeraude.' | Out-Null
Write-Output "Tâche planifiée créée : chaque lundi à 7 h 30 (rattrapée au démarrage si le PC était éteint). Rapport : $repo\out\refresh-report.md"
