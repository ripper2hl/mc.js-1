/* eslint-disable no-unused-vars, no-undef, no-restricted-globals, eslint-disable-line  */

export default () => {
  function ClassicGenerator(seed) {
    /* -------------------------------------------------------------------------- */
    /*                                   CONFIGS                                  */
    /* -------------------------------------------------------------------------- */
    const {
      size: SIZE,
      neighborWidth: NEIGHBOR_WIDTH,
      structures: STRUCTURES,
      block: { liquid: LIQUID_BLOCKS },
      world: {
        waterLevel,
        maxWorldHeight,
        generation: {
          classicGeneration: { swampland }
        }
      }
    } = self.config

    const {
      constants: {
        scale,
        octaves,
        persistance,
        lacunarity,
        heightOffset,
        amplifier,
        treeFreq,
        treeScale
      },
      types: { top, underTop, beach }
    } = swampland

    /* -------------------------------------------------------------------------- */
    /*                              HELPER FUNCTIONS                              */
    /* -------------------------------------------------------------------------- */
    const getNoise = (x, y, z) => this.octavePerlin3(x, y, z) - (y * 4) / scale

    const isSolidAt = (x, y, z) => {
      // TODO: Check cache first
      return getNoise((x * scale) / 100, (y * scale) / 100, (z * scale) / 100) >= -0.2
    }

    const isSolidAtWithCB = (x, y, z) => {
      const cb = this.changedBlocks[get3DCoordsRep(x, y, z)]
      if (cb) return !!cb
      return isSolidAt(x, y, z)
    }

    const getRelativeCoords = (x, y, z, offsets) => ({
      x: x - offsets[0],
      y: y - offsets[1],
      z: z - offsets[2]
    })

    const getAbsoluteCoords = (x, y, z, offsets) => ({
      x: x + offsets[0],
      y: y + offsets[1],
      z: z + offsets[2]
    })

    const checkWithinChunk = (x, y, z) =>
      x >= 0 &&
      x < SIZE + NEIGHBOR_WIDTH * 2 &&
      y >= 0 &&
      y < SIZE + NEIGHBOR_WIDTH * 2 &&
      z >= 0 &&
      z < SIZE + NEIGHBOR_WIDTH * 2

    const shouldPlant = (score, range) => score <= range[1] && score >= range[0]

    /* -------------------------------------------------------------------------- */
    /*                               INITIALIZATION                               */
    /* -------------------------------------------------------------------------- */
    const initSeed = s => {
      let hash = 0
      let chr
      if (s.length === 0) return hash

      for (let i = 0; i < s.length; i++) {
        chr = seed.charCodeAt(i)
        hash = (hash << 5) - hash + chr
        hash |= 0
      }

      if (hash > 0 && hash < 1) hash *= 65536

      hash = Math.floor(hash)

      this.seed = hash
    }

    const initNoises = () => {
      this.noise = new Noise(this.seed)

      // BIOMES
      this.rainfall = new Noise(this.seed * 2)
      this.temp = new Noise(this.seed / 2)
    }

    const initMembers = () => {
      this.maxHeights = {}
      this.treeFreq = [-treeFreq / 100, treeFreq / 100]
    }

    initSeed(seed)
    initNoises()
    initMembers()

    /* -------------------------------------------------------------------------- */
    /*                              MEMBER FUNCTIONS                              */
    /* -------------------------------------------------------------------------- */
    this.getNaiveHighestBlock = (x, z) => {
      let height = 0

      for (let y = maxWorldHeight; y >= 0; y--) {
        const isSolid = isSolidAt(x, y, z)

        if (isSolid) height = y
      }

      const rep = get2DCoordsRep(x, z)
      this.maxHeights[rep] = height

      return height
    }

    this.getHighestBlock = (x, z) => {
      const rep = get2DCoordsRep(x, z)
      if (this.maxHeights[rep]) return this.maxHeights[rep]

      let high = maxWorldHeight
      let low = waterLevel
      let middle = Math.floor((high + low) / 2)

      while (low <= high) {
        if (
          isSolidAtWithCB(x, middle, z) &&
          !isSolidAtWithCB(x, middle + 1, z) &&
          !isSolidAtWithCB(x, middle + 2, z)
        )
          break
        else if (!isSolidAtWithCB(x, middle, z)) high = middle - 1
        else low = middle + 2

        middle = Math.floor((high + low) / 2)
      }

      this.maxHeights[rep] = middle

      return middle
    }

    this.octavePerlin3 = (x, y, z) => {
      let total = 0
      let frequency = 1
      let amplitude = 1
      let maxVal = 0

      for (let i = 0; i < octaves; i++) {
        total +=
          this.noise.perlin3(x * frequency * scale, y * frequency * scale, z * frequency * scale) *
          amplitude

        maxVal += amplitude

        amplitude *= persistance
        frequency *= lacunarity
      }

      return (total / maxVal) * amplifier + heightOffset
    }

    this.registerCB = (changedBlocks = {}) => (this.changedBlocks = changedBlocks)

    this.getLoadedBlocks = (x, y, z, voxelData, offsets) => {
      const relativeCoords = getRelativeCoords(x, y, z, offsets)
      if (checkWithinChunk(relativeCoords.x, relativeCoords.y, relativeCoords.z)) {
        return self.get(voxelData, relativeCoords.x, relativeCoords.z, relativeCoords.y)
      }
      const maxHeight = this.getHighestBlock(x, z)
      return this.getBlockInfo(x, y, z, maxHeight)
    }

    this.getBlockLighting = (x, y, z, voxelData, offsets) => {
      const surroundings = [
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: -1, z: 0 }
      ]

      const lights = new Uint8Array(surroundings.length)

      for (let i = 0; i < surroundings.length; i++) {
        const block = {
          x: x + surroundings[i].x,
          y: y + surroundings[i].y,
          z: z + surroundings[i].z,
          lightLevel: 15
        }
        const value = this.getLoadedBlocks(block.x, block.y, block.z, voxelData, offsets)
        if (LIQUID_BLOCKS.includes(value)) {
          const pastNodeCoords = new Set([get3DCoordsRep(block.x, -1, block.z)])
          const queue = [block]

          while (queue.length > 0) {
            const q = queue.shift()
            if (this.getHighestBlock(q.x, q.z) < q.y) {
              lights[i] = q.lightLevel
              break
            }
            for (let n = 1; n < surroundings.length - 1; n++) {
              const newNode = {
                x: q.x + surroundings[n].x,
                y: -1,
                z: q.z + surroundings[n].z,
                lightLevel: q.lightLevel - 1
              }
              if (
                pastNodeCoords.has(get3DCoordsRep(newNode.x, newNode.y, newNode.z)) ||
                newNode.lightLevel < 0
              )
                continue

              let yValue = q.y

              let startValue = 0

              let endValue = this.getLoadedBlocks(newNode.x, yValue, newNode.z, voxelData, offsets)

              while (LIQUID_BLOCKS.includes(startValue) && !LIQUID_BLOCKS.includes(endValue)) {
                yValue += 1
                startValue = this.getLoadedBlocks(q.x, yValue, q.z, voxelData, offsets)
                endValue = this.getLoadedBlocks(newNode.x, yValue, newNode.z, voxelData, offsets)
              }

              if (!LIQUID_BLOCKS.includes(startValue) || !LIQUID_BLOCKS.includes(endValue)) continue

              newNode.y = yValue

              queue.push(newNode)
              pastNodeCoords.add(get3DCoordsRep(newNode.x, -1, newNode.z))
            }
          }
        }
      }

      return lights
    }

    this.getBlockSmoothLighting = (x, y, z, voxelData) => {
      const output = new Array(6)

      const light = 2
      const shadow = 1

      const nxnzny = self.get(voxelData, x - 1, z - 1, y - 1)
      const nzny = self.get(voxelData, x, z - 1, y - 1)
      const pxnzny = self.get(voxelData, x + 1, z - 1, y - 1)
      const nxny = self.get(voxelData, x - 1, z, y - 1)
      const ny = self.get(voxelData, x, z, y - 1)
      const pxny = self.get(voxelData, x + 1, z, y - 1)
      const nxpzny = self.get(voxelData, x - 1, z + 1, y - 1)
      const pzny = self.get(voxelData, x, z + 1, y - 1)
      const pxpzny = self.get(voxelData, x + 1, z + 1, y - 1)

      const nxnz = self.get(voxelData, x - 1, z - 1, y)
      const nz = self.get(voxelData, x, z - 1, y)
      const pxnz = self.get(voxelData, x + 1, z - 1, y)
      const nx = self.get(voxelData, x - 1, z, y)
      const px = self.get(voxelData, x + 1, z, y)
      const nxpz = self.get(voxelData, x - 1, z + 1, y)
      const pz = self.get(voxelData, x, z + 1, y)
      const pxpz = self.get(voxelData, x + 1, z + 1, y)

      const nxnzpy = self.get(voxelData, x - 1, z - 1, y + 1)
      const nzpy = self.get(voxelData, x, z - 1, y + 1)
      const pxnzpy = self.get(voxelData, x + 1, z - 1, y + 1)
      const nxpy = self.get(voxelData, x - 1, z, y + 1)
      const py = self.get(voxelData, x, z, y + 1)
      const pxpy = self.get(voxelData, x + 1, z, y + 1)
      const nxpzpy = self.get(voxelData, x - 1, z + 1, y + 1)
      const pzpy = self.get(voxelData, x, z + 1, y + 1)
      const pxpzpy = self.get(voxelData, x + 1, z + 1, y + 1)

      if (LIQUID_BLOCKS.includes(py)) {
        const a =
          !LIQUID_BLOCKS.includes(nxpy) ||
          !LIQUID_BLOCKS.includes(nzpy) ||
          !LIQUID_BLOCKS.includes(nxnzpy)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(nxpy) ||
          !LIQUID_BLOCKS.includes(pzpy) ||
          !LIQUID_BLOCKS.includes(nxpzpy)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(pxpy) ||
          !LIQUID_BLOCKS.includes(pzpy) ||
          !LIQUID_BLOCKS.includes(pxpzpy)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(pxpy) ||
          !LIQUID_BLOCKS.includes(nzpy) ||
          !LIQUID_BLOCKS.includes(pxnzpy)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(nxnzpy) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(nxpzpy) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(pxpzpy) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(pxnzpy) ? 0 : 1

        if (e + g > f + h) {
          const py2ColorsFace0 = new Uint8Array(3)
          py2ColorsFace0[0] = b === 0 ? shadow : light
          py2ColorsFace0[1] = c === 0 ? shadow : light
          py2ColorsFace0[2] = a === 0 ? shadow : light

          const py2ColorsFace1 = new Uint8Array(3)
          py2ColorsFace1[0] = c === 0 ? shadow : light
          py2ColorsFace1[1] = d === 0 ? shadow : light
          py2ColorsFace1[2] = a === 0 ? shadow : light

          output[0] = [py2ColorsFace0, py2ColorsFace1, [1, 1, 1]]
        } else {
          const pyColorsFace0 = new Uint8Array(3)
          pyColorsFace0[0] = a === 0 ? shadow : light
          pyColorsFace0[1] = b === 0 ? shadow : light
          pyColorsFace0[2] = d === 0 ? shadow : light

          const pyColorsFace1 = new Uint8Array(3)
          pyColorsFace1[0] = b === 0 ? shadow : light
          pyColorsFace1[1] = c === 0 ? shadow : light
          pyColorsFace1[2] = d === 0 ? shadow : light

          output[0] = [pyColorsFace0, pyColorsFace1, [0, 0, 0]]
        }
      }

      if (LIQUID_BLOCKS.includes(px)) {
        const a =
          !LIQUID_BLOCKS.includes(pxny) ||
          !LIQUID_BLOCKS.includes(pxnz) ||
          !LIQUID_BLOCKS.includes(pxnzny)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(pxny) ||
          !LIQUID_BLOCKS.includes(pxpz) ||
          !LIQUID_BLOCKS.includes(pxpzny)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(pxpy) ||
          !LIQUID_BLOCKS.includes(pxpz) ||
          !LIQUID_BLOCKS.includes(pxpzpy)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(pxpy) ||
          !LIQUID_BLOCKS.includes(pxnz) ||
          !LIQUID_BLOCKS.includes(pxnzpy)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(pxnzny) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(pxpzny) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(pxpzpy) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(pxnzpy) ? 0 : 1

        if (e + g > f + h) {
          const px2ColorsFace0 = new Uint8Array(3)
          px2ColorsFace0[0] = b === 0 ? shadow : light
          px2ColorsFace0[1] = a === 0 ? shadow : light
          px2ColorsFace0[2] = c === 0 ? shadow : light

          const px2ColorsFace1 = new Uint8Array(3)
          px2ColorsFace1[0] = a === 0 ? shadow : light
          px2ColorsFace1[1] = d === 0 ? shadow : light
          px2ColorsFace1[2] = c === 0 ? shadow : light

          output[1] = [px2ColorsFace0, px2ColorsFace1, [1, 1, 1]]
        } else {
          const pxColorsFace0 = new Uint8Array(3)
          pxColorsFace0[0] = c === 0 ? shadow : light
          pxColorsFace0[1] = b === 0 ? shadow : light
          pxColorsFace0[2] = d === 0 ? shadow : light

          const pxColorsFace1 = new Uint8Array(3)
          pxColorsFace1[0] = b === 0 ? shadow : light
          pxColorsFace1[1] = a === 0 ? shadow : light
          pxColorsFace1[2] = d === 0 ? shadow : light

          output[1] = [pxColorsFace0, pxColorsFace1, [0, 0, 0]]
        }
      }

      if (LIQUID_BLOCKS.includes(pz)) {
        const a =
          !LIQUID_BLOCKS.includes(pzny) ||
          !LIQUID_BLOCKS.includes(nxpz) ||
          !LIQUID_BLOCKS.includes(nxpzny)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(pzny) ||
          !LIQUID_BLOCKS.includes(pxpz) ||
          !LIQUID_BLOCKS.includes(pxpzny)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(pzpy) ||
          !LIQUID_BLOCKS.includes(pxpz) ||
          !LIQUID_BLOCKS.includes(pxpzpy)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(pzpy) ||
          !LIQUID_BLOCKS.includes(nxpz) ||
          !LIQUID_BLOCKS.includes(nxpzpy)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(nxpzny) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(pxpzny) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(pxpzpy) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(nxpzpy) ? 0 : 1

        if (e + g < f + h) {
          const pz2ColorsFace0 = new Uint8Array(3)
          pz2ColorsFace0[0] = a === 0 ? shadow : light
          pz2ColorsFace0[1] = b === 0 ? shadow : light
          pz2ColorsFace0[2] = d === 0 ? shadow : light

          const pz2ColorsFace1 = new Uint8Array(3)
          pz2ColorsFace1[0] = b === 0 ? shadow : light
          pz2ColorsFace1[1] = c === 0 ? shadow : light
          pz2ColorsFace1[2] = d === 0 ? shadow : light

          output[2] = [pz2ColorsFace0, pz2ColorsFace1, [1, 1, 1]]
        } else {
          const pzColorsFace0 = new Uint8Array(3)
          pzColorsFace0[0] = d === 0 ? shadow : light
          pzColorsFace0[1] = a === 0 ? shadow : light
          pzColorsFace0[2] = c === 0 ? shadow : light

          const pzColorsFace1 = new Uint8Array(3)
          pzColorsFace1[0] = a === 0 ? shadow : light
          pzColorsFace1[1] = b === 0 ? shadow : light
          pzColorsFace1[2] = c === 0 ? shadow : light

          output[2] = [pzColorsFace0, pzColorsFace1, [0, 0, 0]]
        }
      }

      if (LIQUID_BLOCKS.includes(nx)) {
        const a =
          !LIQUID_BLOCKS.includes(nxny) ||
          !LIQUID_BLOCKS.includes(nxnz) ||
          !LIQUID_BLOCKS.includes(nxnzny)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(nxny) ||
          !LIQUID_BLOCKS.includes(nxpz) ||
          !LIQUID_BLOCKS.includes(nxpzny)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(nxpy) ||
          !LIQUID_BLOCKS.includes(nxpz) ||
          !LIQUID_BLOCKS.includes(nxpzpy)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(nxpy) ||
          !LIQUID_BLOCKS.includes(nxnz) ||
          !LIQUID_BLOCKS.includes(nxnzpy)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(nxnzny) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(nxpzny) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(nxpzpy) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(nxnzpy) ? 0 : 1

        if (e + g > f + h) {
          const nx2ColorsFace0 = new Uint8Array(3)
          nx2ColorsFace0[0] = b === 0 ? shadow : light
          nx2ColorsFace0[1] = a === 0 ? shadow : light
          nx2ColorsFace0[2] = c === 0 ? shadow : light

          const nx2ColorsFace1 = new Uint8Array(3)
          nx2ColorsFace1[0] = a === 0 ? shadow : light
          nx2ColorsFace1[1] = d === 0 ? shadow : light
          nx2ColorsFace1[2] = c === 0 ? shadow : light

          output[3] = [nx2ColorsFace0, nx2ColorsFace1, [1, 1, 1]]
        } else {
          const nxColorsFace0 = new Uint8Array(3)
          nxColorsFace0[0] = c === 0 ? shadow : light
          nxColorsFace0[1] = b === 0 ? shadow : light
          nxColorsFace0[2] = d === 0 ? shadow : light

          const nxColorsFace1 = new Uint8Array(3)
          nxColorsFace1[0] = b === 0 ? shadow : light
          nxColorsFace1[1] = a === 0 ? shadow : light
          nxColorsFace1[2] = d === 0 ? shadow : light

          output[3] = [nxColorsFace0, nxColorsFace1, [0, 0, 0]]
        }
      }

      if (LIQUID_BLOCKS.includes(nz)) {
        const a =
          !LIQUID_BLOCKS.includes(nzny) ||
          !LIQUID_BLOCKS.includes(nxnz) ||
          !LIQUID_BLOCKS.includes(nxnzny)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(nzny) ||
          !LIQUID_BLOCKS.includes(pxnz) ||
          !LIQUID_BLOCKS.includes(pxnzny)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(nzpy) ||
          !LIQUID_BLOCKS.includes(pxnz) ||
          !LIQUID_BLOCKS.includes(pxnzpy)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(nzpy) ||
          !LIQUID_BLOCKS.includes(nxnz) ||
          !LIQUID_BLOCKS.includes(nxnzpy)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(nxnzny) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(pxnzny) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(pxnzpy) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(nxnzpy) ? 0 : 1

        if (e + g < f + h) {
          const nz2ColorsFace0 = new Uint8Array(3)
          nz2ColorsFace0[0] = a === 0 ? shadow : light
          nz2ColorsFace0[1] = b === 0 ? shadow : light
          nz2ColorsFace0[2] = d === 0 ? shadow : light

          const nz2ColorsFace1 = new Uint8Array(3)
          nz2ColorsFace1[0] = b === 0 ? shadow : light
          nz2ColorsFace1[1] = c === 0 ? shadow : light
          nz2ColorsFace1[2] = d === 0 ? shadow : light

          output[4] = [nz2ColorsFace0, nz2ColorsFace1, [1, 1, 1]]
        } else {
          const nzColorsFace0 = new Uint8Array(3)
          nzColorsFace0[0] = d === 0 ? shadow : light
          nzColorsFace0[1] = a === 0 ? shadow : light
          nzColorsFace0[2] = c === 0 ? shadow : light

          const nzColorsFace1 = new Uint8Array(3)
          nzColorsFace1[0] = a === 0 ? shadow : light
          nzColorsFace1[1] = b === 0 ? shadow : light
          nzColorsFace1[2] = c === 0 ? shadow : light

          output[4] = [nzColorsFace0, nzColorsFace1, [0, 0, 0]]
        }
      }

      if (LIQUID_BLOCKS.includes(ny)) {
        const a =
          !LIQUID_BLOCKS.includes(nxny) ||
          !LIQUID_BLOCKS.includes(nzny) ||
          !LIQUID_BLOCKS.includes(nxnzny)
            ? 0
            : 1
        const b =
          !LIQUID_BLOCKS.includes(nxny) ||
          !LIQUID_BLOCKS.includes(pzny) ||
          !LIQUID_BLOCKS.includes(nxpzny)
            ? 0
            : 1
        const c =
          !LIQUID_BLOCKS.includes(pxny) ||
          !LIQUID_BLOCKS.includes(pzny) ||
          !LIQUID_BLOCKS.includes(pxpzny)
            ? 0
            : 1
        const d =
          !LIQUID_BLOCKS.includes(pxny) ||
          !LIQUID_BLOCKS.includes(nzny) ||
          !LIQUID_BLOCKS.includes(pxnzny)
            ? 0
            : 1

        const e = !LIQUID_BLOCKS.includes(nxnzny) ? 0 : 1
        const f = !LIQUID_BLOCKS.includes(nxpzny) ? 0 : 1
        const g = !LIQUID_BLOCKS.includes(pxpzny) ? 0 : 1
        const h = !LIQUID_BLOCKS.includes(pxnzny) ? 0 : 1

        if (e + g > f + h) {
          const ny2ColorsFace0 = new Uint8Array(3)
          ny2ColorsFace0[0] = b === 0 ? shadow : light
          ny2ColorsFace0[1] = c === 0 ? shadow : light
          ny2ColorsFace0[2] = a === 0 ? shadow : light

          const ny2ColorsFace1 = new Uint8Array(3)
          ny2ColorsFace1[0] = c === 0 ? shadow : light
          ny2ColorsFace1[1] = d === 0 ? shadow : light
          ny2ColorsFace1[2] = a === 0 ? shadow : light

          output[5] = [ny2ColorsFace0, ny2ColorsFace1, [1, 1, 1]]
        } else {
          const nyColorsFace0 = new Uint8Array(3)
          nyColorsFace0[0] = a === 0 ? shadow : light
          nyColorsFace0[1] = b === 0 ? shadow : light
          nyColorsFace0[2] = d === 0 ? shadow : light

          const nyColorsFace1 = new Uint8Array(3)
          nyColorsFace1[0] = b === 0 ? shadow : light
          nyColorsFace1[1] = c === 0 ? shadow : light
          nyColorsFace1[2] = d === 0 ? shadow : light

          output[5] = [nyColorsFace0, nyColorsFace1, [0, 0, 0]]
        }
      }

      return output
    }

    this.getBlockInfo = (x, y, z, maxHeight) => {
      let blockId = 0
      const cb = this.changedBlocks[get3DCoordsRep(x, y, z)]

      if (typeof cb === 'number') return cb

      if (y > maxWorldHeight || y <= 0) blockId = 0
      else {
        const isSolid = isSolidAt(x, y, z)

        if (isSolid) {
          if (
            y === waterLevel &&
            !isSolidAt(x, y + 1, z) &&
            (!isSolidAt(x, y, z - 1) ||
              !isSolidAt(x - 1, y, z) ||
              !isSolidAt(x + 1, y, z) ||
              !isSolidAt(x, y, z + 1))
          )
            blockId = beach
          else if (y === maxHeight) {
            if (y < waterLevel) blockId = underTop
            else blockId = top
          } else if (y >= maxHeight - 3 && y < maxHeight) blockId = underTop
          else blockId = 1
        } else if (y <= waterLevel) blockId = 9
      }

      return blockId
    }

    this.setVoxelData = (voxelData, coordx, coordy, coordz) => {
      const offsets = [
        coordx * SIZE - NEIGHBOR_WIDTH,
        coordy * SIZE - NEIGHBOR_WIDTH,
        coordz * SIZE - NEIGHBOR_WIDTH
      ]

      // TREES
      const treeCB = {}

      for (let x = offsets[0]; x < offsets[0] + SIZE + NEIGHBOR_WIDTH * 2; x++)
        for (let z = offsets[2]; z < offsets[2] + SIZE + NEIGHBOR_WIDTH * 2; z++) {
          const maxHeight = this.getHighestBlock(x, z)
          for (let y = offsets[1]; y < offsets[1] + SIZE + NEIGHBOR_WIDTH * 2; y++) {
            if (y === maxHeight) {
              const type = this.getBlockInfo(x, y, z, maxHeight)

              if (
                (type === 2 || type === 3) &&
                this.getBlockInfo(x, y + 1, z, maxHeight) === 0 &&
                shouldPlant(this.noise.simplex2(x / treeScale, z / treeScale), this.treeFreq)
              ) {
                const { override, data } = STRUCTURES.BaseTree

                for (let b = 0; b < data.length; b++) {
                  const { type: treeB, x: dx, y: dy, z: dz } = data[b]
                  treeCB[get3DCoordsRep(x + dx, y + dy, z + dz)] = {
                    type: treeB,
                    override
                  }
                }
              }
            }
          }
        }

      // ACTUAL
      for (let x = offsets[0]; x < offsets[0] + SIZE + NEIGHBOR_WIDTH * 2; x++)
        for (let z = offsets[2]; z < offsets[2] + SIZE + NEIGHBOR_WIDTH * 2; z++) {
          const maxHeight = this.getHighestBlock(x, z)
          for (let y = offsets[1]; y < offsets[1] + SIZE + NEIGHBOR_WIDTH * 2; y++) {
            let blockType = this.getBlockInfo(x, y, z, maxHeight)
            const coordsRep = get3DCoordsRep(x, y, z)
            const treeData = treeCB[coordsRep]

            if (treeData) {
              const { type: treeType, override: treeOverride } = treeData
              if (!blockType || treeOverride) blockType = treeType
            }

            const mappedCoords = getRelativeCoords(x, y, z, offsets)

            self.set(voxelData, mappedCoords.x, mappedCoords.z, mappedCoords.y, blockType)
          }
        }
    }

    this.setLightingData = (
      lightingData,
      smoothLightingData,
      voxelData,
      coordx,
      coordy,
      coordz
    ) => {
      const offsets = [
        coordx * SIZE - NEIGHBOR_WIDTH,
        coordy * SIZE - NEIGHBOR_WIDTH,
        coordz * SIZE - NEIGHBOR_WIDTH
      ]

      for (let x = NEIGHBOR_WIDTH; x < SIZE + NEIGHBOR_WIDTH; x++)
        for (let z = NEIGHBOR_WIDTH; z < SIZE + NEIGHBOR_WIDTH; z++)
          for (let y = NEIGHBOR_WIDTH; y < SIZE + NEIGHBOR_WIDTH; y++) {
            if (!LIQUID_BLOCKS.includes(self.get(voxelData, x, z, y))) {
              const tempCoords = getAbsoluteCoords(x, y, z, offsets)

              const tempx = tempCoords.x
              const tempy = tempCoords.y
              const tempz = tempCoords.z

              const lighting = this.getBlockLighting(tempx, tempy, tempz, voxelData, offsets)
              for (let l = 0; l < 6; l++) {
                self.setLighting(
                  lightingData,
                  x - NEIGHBOR_WIDTH,
                  z - NEIGHBOR_WIDTH,
                  y - NEIGHBOR_WIDTH,
                  l,
                  lighting[l]
                )
              }

              const smoothLighting = this.getBlockSmoothLighting(x, y, z, voxelData)
              for (let l = 0; l < 6; l++) {
                if (smoothLighting[l]) {
                  for (let m = 0; m < 3; m++)
                    for (let n = 0; n < 3; n++) {
                      self.setSmoothLighting(
                        smoothLightingData,
                        x - NEIGHBOR_WIDTH,
                        z - NEIGHBOR_WIDTH,
                        y - NEIGHBOR_WIDTH,
                        l,
                        m,
                        n,
                        smoothLighting[l][m][n]
                      )
                    }
                }
              }
            }
          }
    }
  }
}
