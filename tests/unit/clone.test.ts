import { describe, expect, test } from 'bun:test';
import { cloneBody, cloneDiff, cloneRefusal, ownSettings } from '../../src/clone';
import { editable, recreatedBy, updatable } from '../../src/update';

const ID = 'a1b2c3d4e5f6' + '0'.repeat(52);
const image = {
  Id: 'sha256:old',
  Config: {
    Env: ['PATH=/usr/local/sbin:/usr/bin', 'NGINX_VERSION=1.27.0'],
    Cmd: ['nginx', '-g', 'daemon off;'], Entrypoint: ['/docker-entrypoint.sh'],
    WorkingDir: '', User: '', ExposedPorts: { '80/tcp': {} }, Volumes: { '/var/cache/nginx': {} },
    Labels: { maintainer: 'NGINX Docker Maintainers' }, StopSignal: 'SIGQUIT',
  },
};
const newImage = { ...image, Id: 'sha256:new', Config: { ...image.Config, Env: ['PATH=/usr/local/sbin:/usr/bin', 'NGINX_VERSION=1.27.1'] } };

// A compose container, as docker inspect shows it.
function composeContainer(over: Record<string, any> = {}) {
  return {
    Id: ID, Name: '/shop-web-1', Image: 'sha256:old',
    Config: {
      Hostname: ID.slice(0, 12), Domainname: '', User: '', Tty: false, OpenStdin: false,
      Env: ['PATH=/usr/local/sbin:/usr/bin', 'NGINX_VERSION=1.27.0', 'SHOP_MODE=live'],
      Cmd: ['nginx', '-g', 'daemon off;'], Entrypoint: ['/docker-entrypoint.sh'], Image: 'nginx:1.27',
      WorkingDir: '', ExposedPorts: { '80/tcp': {}, '9000/tcp': {} }, Volumes: { '/var/cache/nginx': {} }, StopSignal: 'SIGQUIT',
      Healthcheck: { Test: ['CMD', 'curl', '-f', 'http://localhost/'], Interval: 10_000_000_000 },
      Labels: {
        maintainer: 'NGINX Docker Maintainers', 'com.docker.compose.project': 'shop', 'com.docker.compose.service': 'web',
        'com.docker.compose.container-number': '1', 'com.docker.compose.config-hash': 'abc', 'com.docker.compose.image': 'sha256:old', team: 'web',
      },
    },
    HostConfig: {
      Binds: ['shop_static:/srv/static:ro'], NetworkMode: 'shop_default', Privileged: false, CapAdd: ['NET_ADMIN'], Memory: 268435456,
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: { '80/tcp': [{ HostIp: '127.0.0.1', HostPort: '8081' }] }, ExtraHosts: ['db.local:10.0.0.5'],
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } }, Mounts: [{ Type: 'tmpfs', Target: '/run/cache' }],
    },
    Mounts: [
      { Type: 'volume', Name: 'shop_static', Source: '/var/lib/docker/volumes/shop_static/_data', Destination: '/srv/static', RW: false },
      { Type: 'volume', Name: 'f'.repeat(64), Source: '/var/lib/docker/volumes/fff/_data', Destination: '/var/cache/nginx', RW: true },
      { Type: 'tmpfs', Source: '', Destination: '/run/cache', RW: true },
    ],
    NetworkSettings: { Networks: { shop_default: { Aliases: ['shop-web-1', 'web', ID.slice(0, 12)] } } },
    State: { Running: true, Status: 'running' },
    ...over,
  };
}

describe('the copy of a container kontainers did not create', () => {
  test('keeps its own settings and leaves the image defaults to the new image', () => {
    const b = cloneBody(composeContainer(), image, 'sha256:new');
    expect(b.Image).toBe('nginx:1.27');
    expect(b.Env).toEqual(['SHOP_MODE=live']);
    expect(b.Cmd).toBeUndefined();
    expect(b.Entrypoint).toBeUndefined();
    expect(b.StopSignal).toBeUndefined();
    expect(b.Hostname).toBeUndefined();
    expect(b.Healthcheck.Test).toEqual(['CMD', 'curl', '-f', 'http://localhost/']);
    expect(b.ExposedPorts).toEqual({ '9000/tcp': {} });
    expect(b.Volumes).toEqual({});
    expect(b.Labels.maintainer).toBeUndefined();
    expect(b.Labels.team).toBe('web');
    expect(b.Labels['com.docker.compose.config-hash']).toBe('abc');
    expect(b.Labels['com.docker.compose.image']).toBe('sha256:new');
    expect(b.Labels['kontainers.replaces']).toBe(ID);
    expect(b.HostConfig.CapAdd).toEqual(['NET_ADMIN']);
    expect(b.HostConfig.Memory).toBe(268435456);
    expect(b.HostConfig.ExtraHosts).toEqual(['db.local:10.0.0.5']);
    expect(b.HostConfig.Binds).toEqual(['shop_static:/srv/static:ro']);
    // The anonymous volume comes along by name; the named one and the tmpfs are already there.
    expect(b.HostConfig.Mounts).toEqual([{ Type: 'tmpfs', Target: '/run/cache' }, { Type: 'volume', Source: 'f'.repeat(64), Target: '/var/cache/nginx', ReadOnly: false }]);
    expect(b.NetworkingConfig).toBeUndefined();
  });

  test("compose's anonymous volume (a mount with no source) gets the old container's volume", () => {
    const c = composeContainer();
    c.HostConfig.Mounts = [{ Type: 'volume', Target: '/cache' } as any];
    c.Mounts.push({ Type: 'volume', Name: 'a'.repeat(64), Source: '/var/lib/docker/volumes/aaa/_data', Destination: '/cache', RW: true });
    const b = cloneBody(c, image, 'sha256:new');
    expect(b.HostConfig.Mounts).toEqual([
      { Type: 'volume', Target: '/cache', Source: 'a'.repeat(64) },
      { Type: 'volume', Source: 'f'.repeat(64), Target: '/var/cache/nginx', ReadOnly: false },
    ]);
    // The container's own record is not changed.
    expect(c.HostConfig.Mounts).toEqual([{ Type: 'volume', Target: '/cache' } as any]);
  });

  test('an entrypoint of its own keeps the command too; a host name of its own stays', () => {
    const c = composeContainer();
    c.Config.Entrypoint = ['/bin/sh', '-c'];
    c.Config.Hostname = 'shop';
    const b = cloneBody(c, image, 'sha256:new');
    expect(b.Entrypoint).toEqual(['/bin/sh', '-c']);
    expect(b.Cmd).toEqual(['nginx', '-g', 'daemon off;']);
    expect(b.Hostname).toBe('shop');
    // Only a command of its own, with the image's entrypoint.
    const d = composeContainer();
    d.Config.Cmd = ['nginx-debug', '-g', 'daemon off;'];
    const e = cloneBody(d, image, 'sha256:new');
    expect(e.Entrypoint).toBeUndefined();
    expect(e.Cmd).toEqual(['nginx-debug', '-g', 'daemon off;']);
  });

  test('on the host network the host name, domain and MAC address are left to Docker', () => {
    const c = composeContainer();
    c.HostConfig.NetworkMode = 'host';
    (c.Config as any).Hostname = 'the-host';
    (c.Config as any).MacAddress = '02:42:ac:11:00:02';
    const b = cloneBody(c, image, 'sha256:new');
    expect(b.Hostname).toBeUndefined();
    expect(b.MacAddress).toBeUndefined();
    expect(b.HostConfig.NetworkMode).toBe('host');
  });

  test('without compose, no compose labels are made up', () => {
    const c = composeContainer();
    c.Config.Labels = { maintainer: 'NGINX Docker Maintainers', team: 'web' } as any;
    const b = cloneBody(c, image, 'sha256:new');
    expect(b.Labels).toEqual({ team: 'web', 'kontainers.replaces': ID });
  });
});

describe('what cannot be copied', () => {
  test('digests, image IDs and swarm tasks have nothing to update to', () => {
    expect(cloneRefusal({ ...composeContainer(), Config: { ...composeContainer().Config, Image: 'nginx@sha256:' + 'a'.repeat(64) } }, [])).toContain('digest');
    expect(cloneRefusal({ ...composeContainer(), Config: { ...composeContainer().Config, Image: 'sha256:' + 'b'.repeat(64) } }, [])).toContain('image ID');
    expect(cloneRefusal({ ...composeContainer(), Config: { ...composeContainer().Config, Image: 'b'.repeat(12) } }, [])).toContain('image ID');
    expect(cloneRefusal({ ...composeContainer(), Config: { ...composeContainer().Config, Labels: { 'com.docker.swarm.service.id': 'x' } } }, [])).toContain('swarm');
    expect(cloneRefusal(composeContainer(), [])).toBeNull();
  });
  test('containers that share its namespaces would be cut off', () => {
    const net = { Id: 'b'.repeat(64), Name: '/sidecar', HostConfig: { NetworkMode: `container:${ID}` } };
    const pid = { Id: 'c'.repeat(64), Name: '/debug', HostConfig: { NetworkMode: 'bridge', PidMode: 'container:shop-web-1' } };
    const other = { Id: 'd'.repeat(64), Name: '/other', HostConfig: { NetworkMode: 'container:' + 'e'.repeat(64) } };
    expect(cloneRefusal(composeContainer(), [net])).toContain('sidecar shares its network');
    expect(cloneRefusal(composeContainer(), [net, pid])).toContain('sidecar, debug share');
    expect(cloneRefusal(composeContainer(), [other])).toBeNull();
  });
  test('which way Update image recreates a container', () => {
    const made = { Config: { Labels: { 'kontainers.managed': 'true' }, Image: 'nginx:1' }, HostConfig: { NetworkMode: 'bridge' } };
    expect(recreatedBy(made)).toBe('spec');
    expect(recreatedBy(composeContainer())).toBe('clone');
    expect(recreatedBy({ Config: { Labels: { 'kontainers.managed': 'true', 'com.docker.compose.project': 'x' } } })).toBe('clone');
    expect(updatable(composeContainer())).toBeNull();
    expect(editable(composeContainer())).toContain('compose file');
    expect(editable({ Config: { Labels: {} } })).toContain('only containers created in kontainers can be edited here');
    expect(updatable({ ...made, HostConfig: { NetworkMode: 'host' } })).toContain("the host's network");
    expect(updatable({ ...composeContainer(), HostConfig: { ...composeContainer().HostConfig, NetworkMode: 'host' } })).toBeNull();
  });
});

describe('checking the copy before it starts', () => {
  // What the daemon shows for the copy: the body's settings merged with the new image's defaults.
  function asCreated(body: Record<string, any>, img: any, over: Record<string, any> = {}) {
    const id = '9'.repeat(64);
    const host = body.HostConfig;
    const mounts = [
      ...(host.Binds || []).map((b: string) => { const [n, d, o] = b.split(':'); return { Type: 'volume', Name: n, Destination: d, RW: o !== 'ro' }; }),
      ...(host.Mounts || []).map((m: any) => m.Type === 'tmpfs' ? { Type: 'tmpfs', Source: '', Destination: m.Target, RW: true } : { Type: m.Type, Name: m.Source, Destination: m.Target, RW: !m.ReadOnly }),
    ];
    return {
      Id: id, Name: '/shop-web-1', Image: img.Id,
      Config: {
        ...body, Hostname: body.Hostname ?? id.slice(0, 12), Env: [...img.Config.Env, ...body.Env], Cmd: body.Cmd ?? img.Config.Cmd, Entrypoint: body.Entrypoint ?? img.Config.Entrypoint,
        StopSignal: body.StopSignal ?? img.Config.StopSignal, Labels: { ...img.Config.Labels, ...body.Labels }, ExposedPorts: { ...img.Config.ExposedPorts, ...body.ExposedPorts },
      },
      HostConfig: host, Mounts: mounts, NetworkSettings: { Networks: { shop_default: { Aliases: ['web', 'shop-web-1'] } } }, ...over,
    };
  }
  test('a faithful copy shows no difference, even when the new image changes its own defaults', () => {
    const old = composeContainer();
    const body = cloneBody(old, image, newImage.Id);
    expect(cloneDiff(old, image, asCreated(body, newImage), newImage)).toEqual([]);
  });
  test('a lost setting or mount is named', () => {
    const old = composeContainer();
    const body = cloneBody(old, image, newImage.Id);
    const copy = asCreated({ ...body, HostConfig: { ...body.HostConfig, CapAdd: null, Binds: [] }, Env: [] }, newImage);
    const diff = cloneDiff(old, image, copy, newImage);
    expect(diff).toContain('Env');
    expect(diff).toContain('CapAdd');
    expect(diff.some(d => d.startsWith('mounts (volume shop_static -> /srv/static (read-only))'))).toBe(true);
    // A network the copy did not join, or an alias it lost.
    expect(cloneDiff(old, image, asCreated(body, newImage, { NetworkSettings: { Networks: { shop_default: { Aliases: ['shop-web-1'] } } } }), newImage)).toEqual(['Networks']);
    expect(cloneDiff(old, image, asCreated(body, newImage, { NetworkSettings: { Networks: {} } }), newImage)).toEqual(['Networks']);
  });
  test('a volume the new image adds is not a difference', () => {
    const old = composeContainer();
    const body = cloneBody(old, image, newImage.Id);
    const copy = asCreated(body, newImage);
    copy.Mounts.push({ Type: 'volume', Name: 'e'.repeat(64), Destination: '/new', RW: true });
    expect(cloneDiff(old, image, copy, newImage)).toEqual([]);
  });
  test('own settings leave out what kontainers itself writes', () => {
    const s = ownSettings(asCreated(cloneBody(composeContainer(), image, newImage.Id), newImage), newImage);
    expect((s.Labels as Record<string, string>)['kontainers.replaces']).toBeUndefined();
    expect((s.Labels as Record<string, string>)['com.docker.compose.image']).toBeUndefined();
    expect(s.Hostname).toBeNull();
  });
});
