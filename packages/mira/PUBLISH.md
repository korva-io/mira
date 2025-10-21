# Publication du package @korva/mira

## Prérequis

1. Compte npm avec accès à l'organisation `@korva`
2. Authentification npm configurée

## Étapes de publication

### 1. Se connecter à npm

```bash
npm login
```

Entrez vos identifiants npm.

### 2. Vérifier le package

```bash
cd packages/mira
npm run build
```

Vérifiez que le build fonctionne correctement.

### 3. Publier le package

```bash
npm publish --access public
```

Le flag `--access public` est nécessaire pour les packages scoped (@korva).

### 4. Vérifier la publication

```bash
npm view @korva/mira
```

## Mise à jour de version

Avant chaque publication, mettre à jour la version dans `package.json` :

```bash
# Version patch (1.0.0 -> 1.0.1)
npm version patch

# Version minor (1.0.0 -> 1.1.0)
npm version minor

# Version major (1.0.0 -> 2.0.0)
npm version major
```

## Notes

- Le script `prepublishOnly` exécute automatiquement le build avant publication
- Les fichiers source TypeScript ne sont pas inclus dans le package (voir `.npmignore`)
- Le code est obfusqué avec Terser pour la protection du code
