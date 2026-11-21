// The shared 3D asset library: where every pack comes from, its licence, and
// which files of it the games keep. scripts/assets-fetch.mjs downloads what is
// listed here into a local cache; scripts/assets-build.mjs turns the selection
// into games/assets/ plus games/assets/catalog.json and games/assets/CREDITS.md.
//
// Rules for adding a pack:
// - CC0 only. Read the licence on the pack's own page AND in the download, and
//   record both in `licenceSeen`.
// - Nothing from a real franchise, brand, team or player. No real gun designs:
//   weapon packs here are stylised sci-fi or toy designs.
// - Keep the library lean: pick what a game will actually use.
//
// A selection entry:
//   { from: 'glob relative to the pack dir', name?: (file) => string,
//     category, tags: [], kit?: 'kit name', hero?: true, anims?: 'strip' | 'only',
//     exclude?: /regex/, maxTris?: n, sizes?: { name: metres }, texture?: (stem) => path,
//     renameMaterials?: { from: to }, outfit?: /body material/, dropVertexColors?: true }
// dropVertexColors: the Downtown kit stores wear masks for its own engine shaders
// in COLOR_0 (red channel); three.js would multiply them in as a red tint.
// outfit: paint an outfit mask for a base body (see outfitMask in assets-build.mjs).
// hero: textures up to 2048 instead of 1024. maxTris: photoscans are simplified
// to at most this many triangles. sizes: scale a model so its longest side is
// this long. texture: a base colour texture (path in the pack) for models whose
// exported material lost it. Characters and crowd figures are scaled to 1.75 m tall; with
// heightRef, the matching model sets one scale for the whole selection (so hair
// still fits and builds keep their proportions). scale: false keeps the source
// units (the Universal Base Characters are already in metres); a number scales
// the whole selection by it (stylised kits built on a 1-unit grid: the factor
// puts them in metres and keeps the grid, e.g. Kenney's city tiles become 10 m).
// `kit` bundles every matched file into ONE .glb (pieces become named nodes),
// so a modular kit's shared textures are stored and downloaded once.

const QAL_NOTE = 'The pack page, the pack listing and the licence file in the download all say CC0 1.0. '
  + 'quaternius.com/license.html also shows a newer "Quaternius Asset License" (updated 2026-08-28) for future '
  + 'releases; its section 7 says it does not apply retroactively, and these downloads carry CC0.';

export const PACKS = [
  // ---------------------------------------------------------------- people
  {
    key: 'q-base-characters', title: 'Universal Base Characters (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://quaternius.com/packs/universalbasecharacters.html',
    download: { kind: 'itch', user: 'quaternius', game: 'universal-base-characters', pick: 'Standard' },
    licenceSeen: ['itch.io listing: "Asset license: Creative Commons Zero v1.0 Universal"', 'License_Standard.txt in the zip: CC0 1.0', QAL_NOTE],
    select: [
      { from: 'Universal Base Characters[Standard]/Base Characters/Godot - UE/*_FullBody.gltf', category: 'character', tags: ['human', 'base-body', 'ual-rig'], scale: false, outfit: /Superhero/i, name: (f) => /Female/.test(f) ? 'female' : 'male' },
      { from: 'Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/*.gltf', category: 'character-part', tags: ['hair', 'ual-rig'], scale: false },
    ],
  },
  {
    key: 'q-anim-library', title: 'Universal Animation Library (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://quaternius.com/packs/universalanimationlibrary.html',
    download: { kind: 'itch', user: 'quaternius', game: 'universal-animation-library', pick: 'Standard' },
    licenceSeen: ['itch.io listing: CC0 1.0', 'License.txt in the zip: CC0 1.0', QAL_NOTE],
    select: [{ from: 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb', category: 'animation', tags: ['ual-rig'], anims: 'only', name: () => 'ual1' }],
  },
  {
    key: 'q-anim-library-2', title: 'Universal Animation Library 2 (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://quaternius.com/packs/universalanimationlibrary2.html',
    download: { kind: 'itch', user: 'quaternius', game: 'universal-animation-library-2', pick: 'Standard' },
    licenceSeen: ['itch.io listing text: "(CC0 License)"', 'License.txt in the zip: CC0 1.0', QAL_NOTE],
    select: [{ from: 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb', category: 'animation', tags: ['ual-rig'], anims: 'only', name: () => 'ual2' }],
  },
  {
    key: 'q-people', title: 'Ultimate Animated Character Pack', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/animated-characters-pack',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/ultimate_animated_character_pack_by_quaternius.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"', QAL_NOTE],
    select: [
      { from: 'Ultimate Animated Character Pack - Nov 2019/FBX/{Casual_Male,Casual_Female,Casual2_Male,Casual2_Female,Casual3_Male,Casual3_Female,Casual_Bald,Suit_Male,Suit_Female,Worker_Male,Worker_Female,Chef_Male,Chef_Female,Doctor_Male_Young,Doctor_Female_Young,Doctor_Male_Old,Doctor_Female_Old,OldClassy_Male,OldClassy_Female,Soldier_Male,Soldier_Female,BlueSoldier_Male,BlueSoldier_Female,Kimono_Male,Kimono_Female}.fbx', category: 'character', tags: ['human', 'dressed', 'people-rig'], anims: 'strip', heightRef: /^casual-male$/ },
      { from: 'Ultimate Animated Character Pack - Nov 2019/FBX/Casual_Male.fbx', category: 'animation', tags: ['people-rig'], anims: 'only', name: () => 'anims' },
    ],
  },
  {
    key: 'q-crowd', title: 'Posed Background Characters', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/lowpoly-posed-humans',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Posed%20Background%20Characters%20by%20%40Quaternius.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"', 'License.txt in the zip'],
    select: [
      { from: 'Posed Background Characters by @Quaternius/{Male,Female}/{Male,Female} {Poses,Hairstyles}/FBX/*.fbx', category: 'crowd', tags: ['human', 'posed', 'static'], kit: 'poses', heightRef: /^male-standing$/ },
    ],
  },
  // ---------------------------------------------------------------- animals
  {
    key: 'q-farm-animals', title: 'LowPoly Animated Farm Animal Pack', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/lowpoly-animated-farm-animal-pack',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Farm%20Animals%20by%20%40Quaternius.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"', 'License.txt in the zip'],
    // Real body length (or wingspan) in metres, the longest side of the model.
    select: [{ from: 'Farm Animals by @Quaternius/FBX/*.fbx', category: 'animal', tags: ['animal', 'animated'], sizes: { cow: 2.3, horse: 2.3, llama: 1.9, pig: 1.3, pug: 0.55, sheep: 1.3, zebra: 2.3 } }],
  },
  {
    key: 'q-animals', title: 'Animal Pack Vol.2', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/animated-animales-low-poly',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Animal%20Pack%20Vol.2%20by%20%40Quaternius.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"'],
    select: [{ from: 'Animal Pack Vol.2 by @Quaternius/FBX/{Cat,Dog,Eagle,Wolf}.fbx', category: 'animal', tags: ['animal', 'animated'], sizes: { cat: 0.75, dog: 1.0, eagle: 1.9, wolf: 1.5 } }],
  },
  // ---------------------------------------------------------------- vehicles
  {
    key: 'kenney-cars', title: 'Car Kit 3.1', author: 'Kenney',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/car-kit',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/kenney_car-kit_3.1.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by Kenney): "License(s): CC0"', 'License.txt in the zip: CC0'],
    select: [{ from: 'Models/GLB format/*.glb', category: 'vehicle', tags: ['car', 'stylised'], scale: 1.75, exclude: /debris-(bolt|nut|plate)/ }],
  },
  {
    key: 'kenney-racing', title: 'Racing Kit 1.2', author: 'Kenney',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/racing-kit',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Racing%20Kit%20%281.2%29.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by Kenney): "License(s): CC0"', 'License.txt in the zip: CC0'],
    select: [{ from: 'Models/glTF format/*.gltf', category: 'track', tags: ['racing', 'track', 'stylised'], scale: 6, exclude: /tankco|flagTankco|billboard/i }],
  },
  {
    key: 'q-cars', title: 'LowPoly Cars', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/lowpoly-cars',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Car%20Pack.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"'],
    // The OBJ files carry UVs but no texture; the pack's paint textures sit in Blends/.
    select: [{ from: 'Car Pack/OBJ/*.obj', category: 'vehicle', tags: ['car', 'lowpoly'], texture: (n) => 'Car Pack/Blends/' + ({ Taxi: 'TaxiTexture', CopCar: 'CopTexture', RaceCar: 'RaceCarTexture' }[n] || 'CarTexture') + '.png' }],
  },
  // ---------------------------------------------------------------- city
  {
    key: 'q-downtown', title: 'Downtown City MegaKit (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://quaternius.com/packs/downtowncitymegakit.html',
    download: { kind: 'itch', user: 'quaternius', game: 'downtown-city-megakit', pick: 'Standard' },
    licenceSeen: ['itch.io listing: "Asset license: Creative Commons Zero v1.0 Universal"', 'License_Standard.txt in the zip: CC0 1.0', QAL_NOTE],
    select: [
      { from: 'Exports/glTF (Godot)/{Street_,Sidewalk_,Decal_,Prop_}*.gltf', category: 'city', tags: ['street', 'pbr', 'modular'], kit: 'streets', dropVertexColors: true },
      { from: 'Exports/glTF (Godot)/Building_*.gltf', category: 'building', tags: ['building', 'pbr'], kit: 'buildings', dropVertexColors: true },
      { from: 'Exports/glTF (Godot)/*.gltf', category: 'city', tags: ['facade', 'pbr', 'modular'], kit: 'facade', dropVertexColors: true, exclude: /^(Street_|Sidewalk_|Decal_|Prop_|Building_)/ },
    ],
  },
  {
    key: 'kenney-city', title: 'City Kit (Commercial 2.1, Suburban 2.0, Roads 2.2)', author: 'Kenney',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/city-kit-commercial',
    sources: ['https://opengameart.org/content/city-kit-commercial', 'https://opengameart.org/content/city-kit-suburban', 'https://opengameart.org/content/city-kit-roads'],
    download: { kind: 'url', url: ['https://opengameart.org/sites/default/files/kenney_city-kit-commercial_2.1.zip', 'https://opengameart.org/sites/default/files/kenney_city-kit-suburban_2.0.zip', 'https://opengameart.org/sites/default/files/kenney_city-kit-roads_2.2.zip'], into: ['commercial', 'suburban', 'roads'] },
    licenceSeen: ['OpenGameArt pages (uploaded by Kenney): "License(s): CC0"', 'License.txt in each zip: CC0'],
    select: [
      { from: 'commercial/Models/GLB format/*.glb', category: 'building', tags: ['building', 'stylised', 'commercial'], scale: 10 },
      { from: 'suburban/Models/GLB format/*.glb', category: 'building', tags: ['building', 'stylised', 'suburban'], scale: 10, name: (f) => 'sub-' + f },
      { from: 'roads/Models/GLB format/*.glb', category: 'city', tags: ['road', 'stylised', 'modular'], scale: 10 },
    ],
  },
  {
    key: 'q-streets', title: 'LowPoly Modular Street Pack', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/lowpoly-modular-street-pack',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Street%20Pack%20by%20%40Quaternius.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"', 'License.txt in the zip'],
    select: [{ from: 'Street Pack by @Quaternius/OBJ/*.obj', category: 'city', tags: ['road', 'lowpoly', 'modular'], scale: 5, exclude: /Streets_all/ }],
  },
  // ---------------------------------------------------------------- nature
  {
    key: 'q-nature', title: 'Stylized Nature MegaKit (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://quaternius.com/packs/stylizednaturemegakit.html',
    download: { kind: 'itch', user: 'quaternius', game: 'stylized-nature-megakit', pick: 'Standard' },
    licenceSeen: ['itch.io listing: "Asset license: Creative Commons Zero v1.0 Universal"', 'License_Standard.txt in the zip: CC0 1.0', QAL_NOTE],
    select: [
      // One kit per species, so a game that wants one tree does not download twenty.
      { from: 'glTF/CommonTree_*.gltf', category: 'nature', tags: ['tree', 'stylised', 'broadleaf'], kit: 'trees-common' },
      { from: 'glTF/Pine_*.gltf', category: 'nature', tags: ['tree', 'stylised', 'conifer'], kit: 'trees-pine' },
      { from: 'glTF/TwistedTree_*.gltf', category: 'nature', tags: ['tree', 'stylised'], kit: 'trees-twisted' },
      { from: 'glTF/DeadTree_*.gltf', category: 'nature', tags: ['tree', 'stylised', 'bare'], kit: 'trees-dead' },
      { from: 'glTF/*.gltf', category: 'nature', tags: ['plant', 'rock', 'stylised'], kit: 'ground', exclude: /^(CommonTree|Pine|TwistedTree|DeadTree)_/ },
    ],
  },
  {
    key: 'kenney-nature', title: 'Nature Kit 2.1', author: 'Kenney',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/nature-kit',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/Nature%20Kit%20%282.1%29.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by Kenney): "License(s): CC0"', 'License.txt in the zip: CC0'],
    select: [{ from: 'Models/GLTF format/{tree_,rock_,stone_,plant_,grass,flower_,log,stump_,mushroom_,fence_,crop,crops_,cactus_,lily_,hanging_moss,pot_,campfire_,tent_}*.glb', category: 'nature', tags: ['nature', 'stylised'], kit: 'nature', scale: 4 }],
  },
  // ---------------------------------------------------------------- props and weapons
  {
    key: 'q-scifi', title: 'Sci-Fi Essentials Kit (Standard)', author: 'Quaternius',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/sci-fi-essentials-kit',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/sci-fi_essentials_kit_models.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by quaternius): "License(s): CC0"', 'License_Standard.txt in the zip: CC0 1.0'],
    select: [
      { from: '**/{Gun_*,Prop_Grenade,Prop_Mine,Prop_Ammo,Prop_Ammo_Small,Prop_Ammo_Closed}.gltf', category: 'weapon', tags: ['weapon', 'sci-fi', 'fictional'], kit: 'guns' },
      { from: '**/Prop_{Crate,Crate_Large,Crate_Tarp,Crate_Tarp_Large,Barrel1,Barrel2_Closed,Barrel2_Open,HealthPack,HealthPack_Tube,Locker,Chair,Desk_Small,Desk_Medium,Desk_L,SatelliteDish,Shelves_WideTall,Shelves_ThinTall,KeyCard}.gltf', category: 'prop', tags: ['prop', 'sci-fi', 'military'], kit: 'props' },
    ],
  },
  {
    key: 'kenney-blasters', title: 'Blaster Kit 2.1', author: 'Kenney',
    licence: 'CC0-1.0', source: 'https://opengameart.org/content/blaster-kit',
    download: { kind: 'url', url: 'https://opengameart.org/sites/default/files/kenney_blaster-kit_2.1.zip' },
    licenceSeen: ['OpenGameArt page (uploaded by Kenney): "License(s): CC0"', 'License.txt in the zip: CC0'],
    select: [{ from: 'Models/GLB format/*.glb', category: 'weapon', tags: ['blaster', 'toy', 'fictional'], kit: 'blasters' }],
  },
  // ---------------------------------------------------------------- Poly Haven (photo scanned, CC0)
  {
    key: 'ph-models', title: 'Poly Haven models', author: 'Poly Haven (various artists)',
    licence: 'CC0-1.0', source: 'https://polyhaven.com/models',
    download: { kind: 'polyhaven-models', ids: ['rock_07', 'rock_09', 'namaqualand_boulder_05', 'fire_hydrant', 'street_lamp_01', 'metal_trash_can', 'barrel_03', 'old_tyre', 'modular_street_seating', 'plastic_crate_01', 'painted_wooden_bench', 'quiver_tree_02'] },
    licenceSeen: ['polyhaven.com/license: "Our assets are all licensed as CC0"'],
    select: [
      { from: '{rock_07,rock_09,namaqualand_boulder_05}/*_1k.gltf', category: 'nature', tags: ['rock', 'photoscan', 'pbr'], hero: true, maxTris: 16000, name: (f) => f.replace(/_1k$/, '') },
      { from: 'quiver_tree_02/*_1k.gltf', category: 'nature', tags: ['tree', 'photoscan', 'pbr'], hero: true, maxTris: 24000, name: (f) => f.replace(/_1k$/, '') },
      { from: '{fire_hydrant,street_lamp_01,metal_trash_can,barrel_03,old_tyre,modular_street_seating,plastic_crate_01,painted_wooden_bench}/*_1k.gltf', category: 'prop', tags: ['street', 'photoscan', 'pbr'], maxTris: 12000, name: (f) => f.replace(/_1k$/, '') },
    ],
  },
  {
    key: 'ph-hdri', title: 'Poly Haven HDRIs (1k)', author: 'Poly Haven (various artists)',
    licence: 'CC0-1.0', source: 'https://polyhaven.com/hdris',
    download: { kind: 'polyhaven-hdri', ids: ['kloofendal_48d_partly_cloudy_puresky', 'qwantani_dusk_2_puresky', 'potsdamer_platz', 'moonless_golf', 'industrial_sunset_puresky'] },
    licenceSeen: ['polyhaven.com/license: CC0'],
    hdri: [
      { id: 'kloofendal_48d_partly_cloudy_puresky', name: 'day', tags: ['midday', 'clouds', 'sky'] },
      { id: 'industrial_sunset_puresky', name: 'golden', tags: ['sunset', 'warm', 'sky'] },
      { id: 'qwantani_dusk_2_puresky', name: 'dusk', tags: ['dusk', 'sky'] },
      { id: 'potsdamer_platz', name: 'overcast-city', tags: ['urban', 'overcast'] },
      { id: 'moonless_golf', name: 'night', tags: ['night', 'stars'] },
    ],
  },
  {
    key: 'acg', title: 'ambientCG materials (1K)', author: 'ambientCG (Lennart Demes)',
    licence: 'CC0-1.0', source: 'https://ambientcg.com',
    download: { kind: 'ambientcg', ids: ['Asphalt031', 'Grass004', 'Concrete034', 'Ground037', 'Fabric081C', 'PavingStones138', 'Bricks076C'] },
    licenceSeen: ['docs.ambientcg.com/license: "All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License"'],
    textures: [
      { id: 'Asphalt031', name: 'asphalt', tags: ['road'] },
      { id: 'Grass004', name: 'grass', tags: ['ground', 'field'] },
      { id: 'Concrete034', name: 'concrete', tags: ['wall', 'floor'] },
      { id: 'Ground037', name: 'dirt', tags: ['ground', 'pitch'] },
      { id: 'Fabric081C', name: 'fabric', tags: ['cloth', 'kit'] },
      { id: 'PavingStones138', name: 'paving', tags: ['street', 'floor'] },
      { id: 'Bricks076C', name: 'bricks', tags: ['wall'] },
    ],
  },
];
