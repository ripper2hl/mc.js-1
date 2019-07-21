import Helpers from '../../../utils/helpers'
import Config from '../../../config/config'

import ndarray from 'ndarray'

const SIZE = Config.chunk.size
const NEIGHBOR_WIDTH = Config.chunk.neighborWidth

function Chunk(x, y, z) {
  let mesh = null
  let cbs = {}
  let loading = true
  let isInScene = false
  let data = null

  const rep = Helpers.get3DCoordsRep(x, y, z)

  this.addSelf = scene => scene.add(mesh)

  this.setData = blocks => {
    data = ndarray(blocks, [
      SIZE + NEIGHBOR_WIDTH * 2,
      SIZE + NEIGHBOR_WIDTH * 2,
      SIZE + NEIGHBOR_WIDTH * 2
    ])
  }
  this.setMesh = m => {
    if (!m) return
    mesh = m
    mesh.name = this.getRep()
    mesh.isChunk = true
  }
  this.setCBs = CBs => (cbs = CBs)
  this.setCB = newCB => {
    const { type, x: cbx, y: cby, z: cbz } = newCB

    cbs[Helpers.get3DCoordsRep(cbx, cby, cbz)] = type
  }
  this.setLoading = bool => (loading = bool)
  this.setIsInScene = bool => (isInScene = bool)

  this.getData = () => data
  this.getRep = () => rep
  this.getMesh = () => mesh
  this.getLoading = () => loading
  this.getIsInScene = () => isInScene
  this.getBlock = (bx, by, bz) =>
    data ? data.get(bx + NEIGHBOR_WIDTH, bz + NEIGHBOR_WIDTH, by + NEIGHBOR_WIDTH) : undefined
}

export default Chunk
