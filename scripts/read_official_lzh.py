import ctypes as C
l=C.CDLL('libarchive.so.13')
def bind(name,restype,*argtypes):
 f=getattr(l,name);f.restype=restype;f.argtypes=argtypes;return f
p=C.c_void_p
new=bind('archive_read_new',p)
support=bind('archive_read_support_format_lha',C.c_int,p)
om=bind('archive_read_open_memory',C.c_int,p,p,C.c_size_t)
next_header=bind('archive_read_next_header',C.c_int,p,C.POINTER(p))
rd=bind('archive_read_data',C.c_ssize_t,p,p,C.c_size_t)
name=bind('archive_entry_pathname',C.c_char_p,p)
close=bind('archive_read_free',C.c_int,p)
err=bind('archive_error_string',C.c_char_p,p)
def unpack(raw):
 a=new()
 try:
  support(a);src=C.create_string_buffer(raw);e=p()
  assert om(a,src,len(raw))==0,err(a)
  assert next_header(a,C.byref(e))==0,err(a)
  filename=name(e).decode('ascii')
  out=bytearray();buf=C.create_string_buffer(65536)
  while n:=rd(a,buf,len(buf)):
   if n<0:raise ValueError(err(a))
   out.extend(buf.raw[:n])
  if next_header(a,C.byref(e))!=1:raise ValueError('expected a single archive member')
  return filename,bytes(out).decode('cp932')
 finally:close(a)
if __name__=='__main__':
 from pathlib import Path
 import sys
 for f in sys.argv[1:]:
  file=Path(f);n,s=unpack(file.read_bytes());file.with_suffix('.txt').write_text(s)
