#!/bin/bash
# Script de setup para nuevos colaboradores

echo "Configurando deskcritter..."

# Configurar git hooks
git config core.hooksPath .githooks
echo "✔ Git hooks configurados (protección de rama main)"

echo ""
echo "¡Listo! Ya podés trabajar en el proyecto."
echo "Recordá crear una rama antes de hacer cambios: git checkout -b mi-rama"
